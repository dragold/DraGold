// DraGold — eBay Browse API: OAuth client-credentials + marketplace map.
// Condiviso fra api/ebay-search.js e api/live-market.js.
// Env: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET

export const MARKETPLACE_MAP = {
  US: { id: 'EBAY_US', currency: 'USD' },
  GB: { id: 'EBAY_GB', currency: 'GBP' },
  DE: { id: 'EBAY_DE', currency: 'EUR' },
  IT: { id: 'EBAY_IT', currency: 'EUR' },
  FR: { id: 'EBAY_FR', currency: 'EUR' },
  ES: { id: 'EBAY_ES', currency: 'EUR' },
  CA: { id: 'EBAY_US', currency: 'USD' },
};

let cachedToken = null;
let cachedTokenExpiry = 0;

export async function getEbayToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiry > now + 60_000) return cachedToken;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing eBay credentials');
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });
  if (!r.ok) throw new Error(`eBay token error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + data.expires_in * 1000;
  return cachedToken;
}
