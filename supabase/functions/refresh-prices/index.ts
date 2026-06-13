// DraGold: Refresh prices for cards that matter (alerts + portfolio).
// Runs via pg_cron every 6 hours. Implements fallback chain per TCG.
//
// Strategy:
//   1. Collect distinct card_ids from active alerts + non-empty collections.
//   2. For each card, try fetchers in order (TCG-specific chain).
//   3. First success wins. Insert into card_prices.
//   4. All API calls logged via loggedFetch -> api_call_log.
//
// FIX 2026-06-11: JustTCG game slug for One Piece is 'one-piece-card-game'
// ('one-piece' returns HTTP 400 "Invalid game parameter"). Also: JustTCG's
// q param is a text search — passing our internal card_api_id (e.g.
// 'onepiece:optcg:OP05-119:en') matches nothing. We now search by the card
// number (e.g. 'OP05-119'), which JustTCG includes in card names/slugs.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch, tryPriceChain } from '../_shared/fetch-with-log.ts'

serve(async (_req) => {
  const supabase = getServiceClient()

  // 1) Get distinct card_ids that need price refresh
  const { data: alerts } = await supabase.from('alerts').select('tcg, card_api_id').eq('is_active', true)
  const { data: collection } = await supabase.from('collection').select('tcg, card_api_id').limit(2000)
  const { data: watchlist } = await supabase.from('watchlist').select('tcg, card_api_id').limit(2000)
  const cards = new Map<string, { tcg: string; card_api_id: string }>()
  ;(alerts || []).forEach(a => cards.set(`${a.tcg}|${a.card_api_id}`, a as any))
  ;(collection || []).forEach(c => cards.set(`${c.tcg}|${c.card_api_id}`, c as any))
  ;(watchlist || []).forEach(w => cards.set(`${w.tcg}|${w.card_api_id}`, w as any))

  const TCGLOOKUP_KEY = Deno.env.get('TCGLOOKUP_API_KEY')
  const JUSTTCG_KEY = Deno.env.get('JUSTTCG_API_KEY')
  const POKEMONTCG_KEY = Deno.env.get('POKEMONTCG_API_KEY')
  // Static USD/EUR rate. Lives in code on purpose — we don't want this Edge Function
  // taking a runtime dependency on a forex API just to normalize Cardmarket EUR prices.
  // Bump manually a few times a year if drift becomes meaningful.
  const EUR_TO_USD = 1.087

  let refreshed = 0
  const errors: any[] = []

  for (const { tcg, card_api_id } of cards.values()) {
    const cardId = `${tcg}:%:${card_api_id}` // logical key for logging

    // Build fallback chain per TCG
    const chain: Array<{ source: string; fetcher: () => Promise<{ price: number | null; raw: any }> }> = []

    if (tcg === 'pokemon') {
      // 1. JustTCG (if key set)
      if (JUSTTCG_KEY) chain.push({
        source: 'justtcg',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'justtcg',
            `https://api.justtcg.com/v1/cards?q=${encodeURIComponent(card_api_id)}&game=pokemon`,
            { timeout: 8000, headers: { 'X-API-Key': JUSTTCG_KEY }, cardId })
          const p = r.data?.data?.[0]?.variants?.[0]?.price
          return { price: parseFloat(p) || null, raw: r.data }
        }
      })
      // 2. Pokemon TCG API (free, 1000/day anon · 20000/day with key)
      // For DraGold's EU audience we prefer Cardmarket avgSellPrice (EUR, EU market signal)
      // converted to USD for consistent storage. TCGplayer USD is the secondary fallback.
      chain.push({
        source: 'pokemontcgio',
        fetcher: async () => {
          const headers: Record<string,string> = {}
          if (POKEMONTCG_KEY) headers['X-Api-Key'] = POKEMONTCG_KEY
          const r = await loggedFetch(supabase, 'pokemontcgio',
            `https://api.pokemontcg.io/v2/cards/${card_api_id}`, { timeout: 8000, headers, cardId })
          const c = r.data?.data
          const cm = c?.cardmarket?.prices
          // Cardmarket: prefer averageSellPrice (last 30d avg), then trendPrice, then avg7
          const eurPrice = cm?.averageSellPrice ?? cm?.trendPrice ?? cm?.avg7 ?? cm?.avg30
          const tp = c?.tcgplayer?.prices
          // TCGplayer: best variant available
          const usdPrice = tp?.holofoil?.market ?? tp?.['1stEditionHolofoil']?.market
            ?? tp?.reverseHolofoil?.market ?? tp?.normal?.market
            ?? tp?.unlimitedHolofoil?.market
          const price = eurPrice ? +eurPrice * EUR_TO_USD : (usdPrice || null)
          return { price, raw: { cm, tp, picked: eurPrice ? 'cardmarket_eur' : 'tcgplayer_usd' } }
        }
      })
      // 3. TCG Price Lookup (universal)
      if (TCGLOOKUP_KEY) chain.push({
        source: 'tcglookup',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'tcglookup',
            `https://www.tcgpricelookup.com/api/v1/cards?game=pokemon&query=${encodeURIComponent(card_api_id)}`,
            { timeout: 8000, headers: { 'Authorization': `Bearer ${TCGLOOKUP_KEY}` }, cardId })
          return { price: r.data?.results?.[0]?.market_price || null, raw: r.data }
        }
      })
    }

    if (tcg === 'mtg') {
      chain.push({
        source: 'scryfall',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'scryfall',
            `https://api.scryfall.com/cards/${card_api_id}`, { timeout: 8000, cardId })
          return { price: parseFloat(r.data?.prices?.usd || '0') || null, raw: r.data?.prices }
        }
      })
      if (TCGLOOKUP_KEY) chain.push({
        source: 'tcglookup',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'tcglookup',
            `https://www.tcgpricelookup.com/api/v1/cards?game=mtg&query=${encodeURIComponent(card_api_id)}`,
            { timeout: 8000, headers: { 'Authorization': `Bearer ${TCGLOOKUP_KEY}` }, cardId })
          return { price: r.data?.results?.[0]?.market_price || null, raw: r.data }
        }
      })
    }

    if (tcg === 'ygo') {
      chain.push({
        source: 'ygoprodeck',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'ygoprodeck',
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${card_api_id}`,
            { timeout: 8000, cardId })
          const p = r.data?.data?.[0]?.card_prices?.[0]
          return { price: parseFloat(p?.tcgplayer_price || p?.cardmarket_price || '0') || null, raw: p }
        }
      })
    }

    if (tcg === 'onepiece') {
      // One Piece via JustTCG on-demand only (no bulk catalog kept locally).
      // JustTCG free tier: 20 results per call.
      // card_api_id is like 'onepiece:optcg:OP05-119:en' → extract the card
      // number and use it as the search term (it appears in JustTCG card names).
      const numMatch = card_api_id.match(/[A-Za-z]{1,4}\d{0,3}-\d{1,4}/)
      const cardNumber = numMatch ? numMatch[0].toUpperCase() : card_api_id
      if (JUSTTCG_KEY) chain.push({
        source: 'justtcg',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'justtcg',
            `https://api.justtcg.com/v1/cards?q=${encodeURIComponent(cardNumber)}&game=one-piece-card-game`,
            { timeout: 8000, headers: { 'X-API-Key': JUSTTCG_KEY }, cardId })
          const p = r.data?.data?.[0]?.variants?.[0]?.price
          return { price: parseFloat(p) || null, raw: r.data }
        }
      })
      // Fallback: TCG Price Lookup universal
      if (TCGLOOKUP_KEY) chain.push({
        source: 'tcglookup',
        fetcher: async () => {
          const r = await loggedFetch(supabase, 'tcglookup',
            `https://www.tcgpricelookup.com/api/v1/cards?game=onepiece&query=${encodeURIComponent(cardNumber)}`,
            { timeout: 8000, headers: { 'Authorization': `Bearer ${TCGLOOKUP_KEY}` }, cardId })
          return { price: r.data?.results?.[0]?.market_price || null, raw: r.data }
        }
      })
    }

    // card_api_id IS the cards.id (FK target of card_prices.card_id).
    // Do NOT prefix with tcg — that breaks the FK and the insert fails silently.
    const result = await tryPriceChain(supabase, chain, card_api_id)
    if (result.price != null) refreshed++
    else errors.push({ tcg, card_api_id, reason: 'all sources failed' })
  }

  return new Response(JSON.stringify({
    ok: true,
    total_cards: cards.size,
    refreshed,
    failed: errors.length,
    sample_errors: errors.slice(0, 5),
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
