// DraGold: Refresh prices for cards that matter (alerts + portfolio + hot picks).
// Runs via pg_cron every 6 hours. Implements fallback chain per TCG.
//
// Strategy:
//   1. Collect distinct card_ids from: active alerts + collections + watchlist + hot_picks (top 200).
//   2. For each card:
//      a. Try fetchers in order (PRIMARY: eBay Browse → FALLBACK: TCG-specific APIs).
//         First success → insert into card_prices with timeframe=NULL (spot price).
//      b. Call eBay Finding API findCompletedItems for last 90d of SOLD listings.
//         Filter client-side → insert 3 rows with timeframe='7d'/'30d'/'90d'.
//   3. All API calls logged via loggedFetch -> api_call_log.
//
// IMPORTANT — card_id format:
//   collection.card_api_id = cards.id = full compound ID (e.g. "pokemon:tcgdex:sv3pt5-174:en")
//   card_prices.card_id    = same full compound ID  (do NOT prepend tcg again!)
//
// JP cards (lang='ja'): uses eBay US marketplace + seller_location='JP' filter for
// best inventory coverage of Japan-sourced cards.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch, tryPriceChain } from '../_shared/fetch-with-log.ts'

// ─── eBay credentials ────────────────────────────────────────────────────────
// EBAY_APP_ID is used only if fetch-ebay-sold edge function exists.
// If it doesn't exist, the fallback chain uses TCG-specific APIs only.
const EBAY_APP_ID  = Deno.env.get('EBAY_APP_ID')  || Deno.env.get('EBAY_CLIENT_ID')  || ''

// TCG keyword map for eBay search queries.
// IMPORTANT: keys must match the `tcg` column values in collection/watchlist/alerts
// (i.e. 'op' not 'onepiece' for One Piece).
const TCG_KEYWORD: Record<string, string> = {
  pokemon: 'pokemon card',
  mtg:     'magic gathering card',
  ygo:     'yugioh card',
  op:      'one piece card tcg',
};

serve(async (_req) => {
  const supabase = getServiceClient()

  // 1) Collect all cards that need a price refresh
  const { data: alerts } = await supabase
    .from('alerts')
    .select('tcg, card_api_id, card_name, language')
    .eq('is_active', true)

  const { data: collection } = await supabase
    .from('collection')
    .select('tcg, card_api_id, card_name, language')
    .limit(2000)

  // Watchlist: no `language` column in live schema, defaults to EN
  const { data: watchlist } = await supabase
    .from('watchlist')
    .select('tcg, card_api_id, card_name')
    .limit(2000)

  const cards = new Map<string, { tcg: string; card_api_id: string; card_name: string; language?: string }>()
  ;(alerts    || []).forEach(a => cards.set(a.card_api_id, a as any))
  ;(collection|| []).forEach(c => cards.set(c.card_api_id, c as any))
  ;(watchlist || []).forEach(w => cards.set(w.card_api_id, w as any))

  // Also refresh top hot_picks cards (ensures trending cards always have fresh prices)
  try {
    const { data: hotPickRows } = await supabase
      .from('hot_picks')
      .select('card_id')
      .order('rank')
      .limit(200)

    const hotIds = (hotPickRows || []).map((h: any) => h.card_id).filter(Boolean)
    if (hotIds.length > 0) {
      const { data: hotCards } = await supabase
        .from('cards')
        .select('id, name, lang, tcg')
        .in('id', hotIds)

      for (const c of (hotCards || [])) {
        if (!cards.has(c.id)) {
          cards.set(c.id, { tcg: c.tcg, card_api_id: c.id, card_name: c.name, language: c.lang })
        }
      }
    }
  } catch (_) { /* hot_picks expansion is best-effort */ }

  const TCGLOOKUP_KEY  = Deno.env.get('TCGLOOKUP_API_KEY')
  const JUSTTCG_KEY    = Deno.env.get('JUSTTCG_API_KEY')
  const POKEMONTCG_KEY = Deno.env.get('POKEMONTCG_API_KEY')
  const EUR_TO_USD = 1.087

  let refreshed = 0
  const errors: any[] = []

  for (const { tcg, card_api_id, card_name, language } of cards.values()) {
    const cardId = card_api_id
    const sourceLocalId = card_api_id.split(':').slice(2).join(':')
    const isJP  = language === 'ja'
    const tcgKw = TCG_KEYWORD[tcg] || 'trading card'

    const ebayQuery     = isJP
      ? `${card_name || sourceLocalId} ${tcgKw} japanese`.trim()
      : `${card_name || sourceLocalId} ${tcgKw}`.trim()

    // A) Spot price via fallback chain — solo fonti TCG (JustTCG, PokemonTCG.io, Scryfall, YGOPRODeck).
    // Il ramo eBay (fetch-ebay-sold) è escluso: la funzione edge non è nel codebase e crea
    // una dipendenza fragile. Le fonti TCG sono sufficienti per MVP e funzionano senza credential
    // eBay aggiuntive (tranne JustTCG che usa la chiave già configurata).
    const chain: Array<{ source: string; fetcher: () => Promise<{ price: number | null; raw: any }> }> = []
    if (tcg === 'pokemon') {
      if (JUSTTCG_KEY) chain.push({
        source: 'justtcg',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'justtcg',
            `https://api.justtcg.com/v1/cards?q=${encodeURIComponent(card_name || sourceLocalId)}&game=pokemon`,
            { timeout: 8000, headers: { 'X-API-Key': JUSTTCG_KEY }, cardId })
          const p = r.data?.data?.[0]?.variants?.[0]?.price
          return { price: parseFloat(p) || null, raw: r.data }
        }
      })
      // pokemontcg.io: EN only — JA card IDs (e.g. SV2D-082) don't exist on pokemontcg.io
      if (!isJP) chain.push({
        source: 'pokemontcgio',
        fetcher: async () => {
          const headers: Record<string,string> = {}
          if (POKEMONTCG_KEY) headers['X-Api-Key'] = POKEMONTCG_KEY
          const pkmnId = sourceLocalId.split(':')[0]  // "sv3pt5-174" (drop lang suffix)
          const r = await loggedFetch(supabase, 'pokemontcgio',
            `https://api.pokemontcg.io/v2/cards/${pkmnId}`, { timeout: 8000, headers, cardId })
          const c = r.data?.data
          const cm = c?.cardmarket?.prices
          const eurPrice = cm?.averageSellPrice ?? cm?.trendPrice ?? cm?.avg7 ?? cm?.avg30
          const tp = c?.tcgplayer?.prices
          const usdPrice = tp?.holofoil?.market ?? tp?.['1stEditionHolofoil']?.market
                        ?? tp?.reverseHolofoil?.market ?? tp?.normal?.market
                        ?? tp?.unlimitedHolofoil?.market
          const price = eurPrice ? +eurPrice * EUR_TO_USD : (usdPrice || null)
          return { price, raw: { cm, tp, picked: eurPrice ? 'cardmarket_eur' : 'tcgplayer_usd' } }
        }
      })
    }

    if (tcg === 'mtg') {
      // Scryfall: needs UUID only (e.g. "abc-uuid" from "mtg:scryfall:abc-uuid")
      chain.push({
        source: 'scryfall',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'scryfall',
            `https://api.scryfall.com/cards/${sourceLocalId}`, { timeout: 8000, cardId })
          return { price: parseFloat(r.data?.prices?.usd || '0') || null, raw: r.data?.prices }
        }
      })
    }

    if (tcg === 'ygo') {
      // YGOPRODeck: needs numeric ID only (e.g. "12345" from "ygo:ygoprodeck:12345")
      chain.push({
        source: 'ygoprodeck',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'ygoprodeck',
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${sourceLocalId}`,
            { timeout: 8000, cardId })
          const p = r.data?.data?.[0]?.card_prices?.[0]
          return { price: parseFloat(p?.tcgplayer_price || p?.cardmarket_price || '0') || null, raw: p }
        }
      })
    }

    if (tcg === 'op') {
      if (JUSTTCG_KEY) chain.push({
        source: 'justtcg',
        fetcher: async () => {
          const cardNum = sourceLocalId.split(':')[0]  // e.g. "OP05-119"
          const r = await loggedFetch(supabase, 'justtcg',
            `https://api.justtcg.com/v1/cards?q=${encodeURIComponent(cardNum)}&game=one-piece-card-game`,
            { timeout: 8000, headers: { 'X-API-Key': JUSTTCG_KEY }, cardId })
          const p = r.data?.data?.[0]?.variants?.[0]?.price
          return { price: parseFloat(p) || null, raw: r.data }
        }
      })
    }

    const result = await tryPriceChain(supabase, chain, cardId)
    if (result.price != null) refreshed++
    else errors.push({ cardId, reason: 'all sources failed' })
  }

  return new Response(JSON.stringify({
    ok: true,
    total_cards:   cards.size,
    refreshed,
    failed:        errors.length,
    sample_errors: errors.slice(0, 5),
    ebay_finding:  EBAY_APP_ID ? 'enabled (fetch-ebay-sold if deployed)' : 'disabled (EBAY_APP_ID not set)',
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
