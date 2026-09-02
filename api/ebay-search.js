// Vercel serverless function: proxy to eBay Browse API
// Real-time active listings on the user's local marketplace.
//
// Endpoint: GET /api/ebay-search?q=Charizard+ex&market=IT&limit=5
// Returns: { lowest: 42.50, count: 87, currency: "EUR", items: [...] }
//
// Required env vars in Vercel:
//   EBAY_CLIENT_ID
//   EBAY_CLIENT_SECRET

// OAuth + marketplace map: condivisi con api/live-market.js (Fase 2).
import { getEbayToken, MARKETPLACE_MAP } from './_lib/ebay.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800')
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  const { q, market = 'US', limit = '5' } = req.query
  if (!q) return res.status(400).json({ error: 'Missing q parameter' })
  const mk = MARKETPLACE_MAP[market] || MARKETPLACE_MAP.US
  try {
    const token = await getEbayToken()
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
    url.searchParams.set('q', q)
    url.searchParams.set('limit', String(Math.min(parseInt(limit) || 5, 20)))
    url.searchParams.set('sort', 'price')
    let filter = `buyingOptions:{FIXED_PRICE},priceCurrency:${mk.currency}`
    if (market !== 'US' && market !== 'CA') filter += `,itemLocationCountry:${market}`
    url.searchParams.set('filter', filter)
    const ebayRes = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': mk.id, 'Accept': 'application/json' },
    })
    if (!ebayRes.ok) {
      const txt = await ebayRes.text()
      return res.status(ebayRes.status).json({ error: 'eBay API error', detail: txt.slice(0, 300) })
    }
    const data = await ebayRes.json()
    const items = (data.itemSummaries || []).map(it => ({
      title: it.title,
      price: parseFloat(it.price?.value || '0'),
      currency: it.price?.currency || mk.currency,
      url: it.itemWebUrl,
      thumb: it.image?.imageUrl,
      condition: it.condition,
      seller: it.seller?.username,
      shippingCost: parseFloat(it.shippingOptions?.[0]?.shippingCost?.value || '0'),
    })).filter(i => i.price > 0)
    const lowest = items.length > 0 ? Math.min(...items.map(i => i.price)) : null
    return res.status(200).json({ lowest, count: data.total || items.length, currency: mk.currency, market: mk.id, items: items.slice(0, parseInt(limit) || 5) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
