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
// App ID is used for:
//   - OAuth token (Browse API) via fetch-ebay-sold edge fn → EBAY_APP_ID + EBAY_CERT_ID
//   - Finding API (findCompletedItems) → only App ID needed as SECURITY-APPNAME
const EBAY_APP_ID  = Deno.env.get('EBAY_APP_ID')  || Deno.env.get('EBAY_CLIENT_ID')  || ''

// ─── Finding API: fetch sold listings for last N days ────────────────────────
// Makes ONE call with a 90-day window, then splits client-side into 7d/30d/90d.
// Returns null on any fatal error (no credentials, timeout, bad response).

interface SoldStats {
  avg:    number | null
  median: number | null
  count:  number
}

interface SoldTimeframes {
  '7d':  SoldStats
  '30d': SoldStats
  '90d': SoldStats
}

function computeStats(prices: number[]): SoldStats {
  if (!prices.length) return { avg: null, median: null, count: 0 }
  const sorted = [...prices].sort((a, b) => a - b)
  const n = sorted.length
  const avg    = +(sorted.reduce((s, p) => s + p, 0) / n).toFixed(2)
  const median = +(sorted[Math.floor(n / 2)]).toFixed(2)
  return { avg, median, count: n }
}

async function findEbaySold(
  query:          string,
  globalId:       string,   // 'EBAY-IT' | 'EBAY-US' | 'EBAY-GB'
  sellerCountry?: string,   // e.g. 'JP'
  timeoutMs = 12000
): Promise<SoldTimeframes | null> {
  if (!EBAY_APP_ID) return null

  const now    = Date.now()
  const from90 = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Build query params for findCompletedItems
  const params: Record<string, string> = {
    'OPERATION-NAME':        'findCompletedItems',
    'SERVICE-VERSION':       '1.0.0',
    'SECURITY-APPNAME':      EBAY_APP_ID,
    'RESPONSE-DATA-FORMAT':  'JSON',
    'GLOBAL-ID':             globalId,
    'keywords':              query,
    'itemFilter(0).name':    'SoldItemsOnly',
    'itemFilter(0).value':   'true',
    'itemFilter(1).name':    'EndTimeFrom',
    'itemFilter(1).value':   from90,
    'paginationInput.entriesPerPage': '100',
    'paginationInput.pageNumber':     '1',
    'sortOrder':             'StartTimeNewest',  // newest listings first
  }

  // Optional seller country filter (for JP cards)
  if (sellerCountry) {
    params['itemFilter(2).name']  = 'LocatedIn'
    params['itemFilter(2).value'] = sellerCountry
  }

  const url = 'https://svcs.ebay.com/services/search/FindingService/v1?' +
    Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, { signal: ctrl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(tid)
  }

  if (!res.ok) return null

  let data: any
  try {
    data = await res.json()
  } catch {
    return null
  }

  // Navigate the heavily-nested Finding API JSON response
  const items: any[] = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || []

  // Extract price + end-time for each sold item
  const parsed: Array<{ price: number; endMs: number }> = []
  for (const item of items) {
    const priceRaw = item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__
    const endTimeRaw = item?.listingInfo?.[0]?.endTime?.[0]
    const price = parseFloat(priceRaw || '0')
    const endMs = endTimeRaw ? new Date(endTimeRaw).getTime() : 0
    if (price > 0 && endMs > 0) parsed.push({ price, endMs })
  }

  if (!parsed.length) return null

  const MS_7D  = 7  * 24 * 60 * 60 * 1000
  const MS_30D = 30 * 24 * 60 * 60 * 1000

  const cutoff7d  = now - MS_7D
  const cutoff30d = now - MS_30D

  return {
    '7d':  computeStats(parsed.filter(x => x.endMs >= cutoff7d) .map(x => x.price)),
    '30d': computeStats(parsed.filter(x => x.endMs >= cutoff30d).map(x => x.price)),
    '90d': computeStats(parsed.map(x => x.price)),
  }
}

// ─── fetch-ebay-sold proxy (Browse API — spot price for fallback chain) ───────
async function callFetchEbaySold(
  supabase: ReturnType<typeof getServiceClient>,
  query: string,
  sellerLocation?: string,  // e.g. 'JP'
  country = 'eu'            // 'us' for JP cards (more JP-seller inventory on EBAY_US)
): Promise<number | null> {
  try {
    const body: Record<string, unknown> = { query, country, limit: 20 };
    if (sellerLocation) body.seller_location = sellerLocation;

    const { data, error } = await supabase.functions.invoke('fetch-ebay-sold', { body });
    if (error || !data) return null;

    const price = data.median ?? data.avgPrice ?? null;
    return price != null && price > 0 ? +Number(price).toFixed(2) : null;
  } catch {
    return null;
  }
}

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

  let refreshed     = 0
  let soldRefreshed = 0
  const errors: any[] = []

  for (const { tcg, card_api_id, card_name, language } of cards.values()) {
    // FIX: card_api_id IS already the full compound ID (e.g. "pokemon:tcgdex:sv3pt5-174:en").
    // Do NOT prepend tcg again — that was creating doubled prefixes like "pokemon:pokemon:...".
    const cardId = card_api_id

    // Extract source-local ID for fallback APIs (strip "tcg:source:" prefix)
    // e.g. "mtg:scryfall:abc-uuid" → "abc-uuid"  |  "ygo:ygoprodeck:12345" → "12345"
    const sourceLocalId = card_api_id.split(':').slice(2).join(':')

    const isJP  = language === 'ja'
    const tcgKw = TCG_KEYWORD[tcg] || 'trading card'

    // JP: append "japanese" keyword + use US marketplace (more JP-seller inventory)
    const ebayQuery     = isJP
      ? `${card_name || sourceLocalId} ${tcgKw} japanese`.trim()
      : `${card_name || sourceLocalId} ${tcgKw}`.trim()
    const ebayCountry   = isJP ? 'us' : 'eu'
    const ebaySellerLoc = isJP ? 'JP' : undefined
    const ebayGlobalId  = isJP ? 'EBAY-US' : 'EBAY-IT'

    // ── A) Spot price via existing fallback chain ──────────────────────────────
    const chain: Array<{ source: string; fetcher: () => Promise<{ price: number | null; raw: any }> }> = []

    // PRIMARY: eBay Browse API (median of live fixed-price listings)
    chain.push({
      source: 'ebay_sold',
      fetcher: async () => {
        const price = await callFetchEbaySold(supabase, ebayQuery, ebaySellerLoc, ebayCountry)
        return { price, raw: { query: ebayQuery, country: ebayCountry, seller_location: ebaySellerLoc ?? 'any' } }
      }
    })

    // FALLBACKS per TCG
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
      // pokemontcg.io: uses the set-local part of the ID (e.g. "sv3pt5-174" from "pokemon:tcgdex:sv3pt5-174:en")
      chain.push({
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

    // ── B) eBay sold timeframes via Finding API ────────────────────────────────
    // One API call per card fetches 90 days of completed listings.
    // We split the results client-side into 7d / 30d / 90d windows and save
    // each as a separate card_prices row with timeframe set.
    // Currency: EBAY-IT → EUR, EBAY-US → USD (stored as-is; frontend reads currency column).
    if (EBAY_APP_ID) {
      try {
        const soldTf = await findEbaySold(ebayQuery, ebayGlobalId, ebaySellerLoc)
        if (soldTf) {
          const now      = new Date().toISOString()
          const currency = isJP ? 'USD' : 'EUR'

          const rows = Object.entries(soldTf)
            .filter(([, s]) => (s as SoldStats).avg != null || (s as SoldStats).median != null)
            .map(([tf, s]) => {
              const st = s as SoldStats
              return {
                card_id:      cardId,
                source:       'ebay_finding',
                currency,
                price_market: st.avg,       // avg is the "main" price (backward compatible)
                price_median: st.median,
                timeframe:    tf,
                raw_response: { count: st.count, avg: st.avg, median: st.median, query: ebayQuery },
                captured_at:  now,
              }
            })

          if (rows.length > 0) {
            await supabase.from('card_prices').insert(rows)
            soldRefreshed++
          }
        }
      } catch (_) { /* Finding API is best-effort; don't fail the whole card */ }
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    total_cards:   cards.size,
    refreshed,
    sold_refreshed: soldRefreshed,
    failed:        errors.length,
    sample_errors: errors.slice(0, 5),
    ebay_finding:  EBAY_APP_ID ? 'enabled' : 'disabled (EBAY_APP_ID not set)',
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
