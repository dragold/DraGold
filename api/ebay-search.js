// Vercel serverless function: proxy to eBay Browse API
// Real-time active listings on the user's local marketplace.
//
// Endpoint: GET /api/ebay-search?q=Charizard+ex&market=IT&limit=5
// Returns: { lowest: 42.50, count: 87, currency: "EUR", items: [...] }
//
// Required env vars in Vercel:
//   EBAY_CLIENT_ID
//   EBAY_CLIENT_SECRET

const MARKETPLACE_MAP = {
  US: { id: 'EBAY_US', currency: 'USD' },
  GB: { id: 'EBAY_GB', currency: 'GBP' },
  DE: { id: 'EBAY_DE', currency: 'EUR' },
  IT: { id: 'EBAY_IT', currency: 'EUR' },
  FR: { id: 'EBAY_FR', currency: 'EUR' },
  ES: { id: 'EBAY_ES', currency: 'EUR' },
  CA: { id: 'EBAY_US', currency: 'USD' },
}

let cachedToken = null
let cachedTokenExpiry = 0

async function getEbayToken() {
  const now = Date.now()
  if (cachedToken && cachedTokenExpiry > now + 60_000) return cachedToken
  const clientId = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Missing eBay credentials')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  })
  if (!r.ok) throw new Error(`eBay token error ${r.status}: ${await r.text()}`)
  const data = await r.json()
  cachedToken = data.access_token
  cachedTokenExpiry = now + (data.expires_in * 1000)
  return cachedToken
}

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
