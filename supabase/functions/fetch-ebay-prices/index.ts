// DraGold — eBay Browse API Price Fetcher v1 (zero imports)
// Ritorna prezzi reali eBay EU per query TCG cards
// Deploy: Management API POST (già deployata v1)

const EBAY_APP_ID  = Deno.env.get('EBAY_APP_ID') || '';
const EBAY_CERT_ID = Deno.env.get('EBAY_CERT_ID') || '';
const EBAY_AFFILIATE_ID = '5339152703';
const TIMEOUT_MS = 25000; // 25 secondi per evitare timeout Supabase (30s default)

const MARKETPLACE_MAP: Record<string, string> = {
  'it': 'EBAY_IT', 'de': 'EBAY_DE', 'fr': 'EBAY_FR',
  'es': 'EBAY_ES', 'gb': 'EBAY_GB', 'nl': 'EBAY_NL',
  'be': 'EBAY_BE', 'at': 'EBAY_AT', 'ch': 'EBAY_CH',
  'us': 'EBAY_US', 'ca': 'EBAY_CA', 'au': 'EBAY_AU',
  'eu': 'EBAY_IT'
};

// Token cache in-memory (si azzera ad ogni cold start, dura max 2h)
let _token: string | null = null;
let _expiry = 0;

async function getToken(): Promise<string> {
  if (!EBAY_APP_ID || !EBAY_CERT_ID) {
    throw new Error('eBay credentials not configured (EBAY_APP_ID, EBAY_CERT_ID required)');
  }
  const now = Date.now();
  if (_token && now < _expiry - 60000) return _token;
  const creds = btoa(`${EBAY_APP_ID}:${EBAY_CERT_ID}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    if (!r.ok) throw new Error(`eBay token failed: ${r.status}`);
    const d = await r.json();
    _token = d.access_token;
    _expiry = now + (d.expires_in * 1000);
    return _token!;
  } finally {
    clearTimeout(timeoutId);
  }
}

function affUrl(u: string): string {
  try {
    const url = new URL(u);
    url.searchParams.set('mkevt', '1');
    url.searchParams.set('mkcid', '1');
    url.searchParams.set('campid', EBAY_AFFILIATE_ID);
    url.searchParams.set('toolid', '10001');
    return url.toString();
  } catch { return u; }
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const b = await req.json().catch(() => ({}));
    const query   = b.query || '';
    const country = (b.country || 'it').toLowerCase();
    const limit   = Math.min(b.limit || 10, 50);

    if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers: cors });

    const mid = MARKETPLACE_MAP[country] || 'EBAY_IT';
    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('marketplace_id', mid);
    url.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');
    url.searchParams.set('sort', 'price');

    const token = await getToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': mid }
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const e = await res.text();
      return new Response(JSON.stringify({ error: 'eBay error', status: res.status, detail: e.substring(0, 300) }), { status: 502, headers: cors });
    }

    const data = await res.json();
    const items = (data.itemSummaries || []).map((i: any) => ({
      itemId:    i.itemId,
      title:     i.title,
      price:     i.price ? parseFloat(i.price.value) : null,
      currency:  i.price?.currency || 'EUR',
      condition: i.condition || null,
      image:     i.image?.imageUrl || null,
      url:       i.itemWebUrl ? affUrl(i.itemWebUrl) : null,
      seller:    i.seller?.username || null,
      location:  i.itemLocation?.country || null,
    }));

    return new Response(JSON.stringify({ query, marketplace: mid, total: data.total || 0, count: items.length, items }), { status: 200, headers: cors });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});