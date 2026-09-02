// DraGold — Market Valuation (Fase 2)
// eBay Browse API — helper PURI (query + parsing). Nessun I/O, nessun OAuth qui
// (quello vive in api/_lib/ebay.js, lato Vercel). Live Market = annunci ATTIVI,
// separato dalla valutazione.

const TCG_SUFFIX = {
  pokemon: 'pokemon card',
  onepiece: 'one piece card game',
  mtg: 'magic the gathering card',
  ygo: 'yugioh card',
};

/**
 * @param {{name:string, tcg:string, setName?:string, number?:string, lang?:string}} card
 * @returns {string}
 */
export function buildBrowseQuery({ name, tcg, setName = '', number = '', lang = 'en' } = {}) {
  const suffix = TCG_SUFFIX[tcg] || 'trading card';
  const jp = lang === 'ja' ? 'japanese' : '';
  return [name, number, setName, suffix, jp]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} json - risposta item_summary/search
 * @param {string} fallbackCurrency
 * @returns {{listings:Array, count:number}}
 */
export function parseBrowseResponse(json, fallbackCurrency = 'EUR') {
  const items = Array.isArray(json?.itemSummaries) ? json.itemSummaries : [];
  const listings = items.map((it) => ({
    title: it.title || null,
    price: parseFloat(it.price?.value || '0') || 0,
    currency: it.price?.currency || fallbackCurrency,
    condition: it.condition || null,
    url: it.itemWebUrl || null,
    imageUrl: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
    seller: it.seller?.username || null,
    shipping: parseFloat(it.shippingOptions?.[0]?.shippingCost?.value || '0') || 0,
  })).filter((l) => l.price > 0);

  return { listings, count: Number.isFinite(json?.total) ? json.total : listings.length };
}

/** Statistica sintetica degli annunci per il badge "Live Market". */
export function summarizeListings(listings) {
  if (!listings || !listings.length) return { count: 0, lowest: null, median: null, currency: null };
  const prices = listings.map((l) => l.price).sort((a, b) => a - b);
  const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  return {
    count: listings.length,
    lowest: prices[0],
    median: Math.round(mid * 100) / 100,
    currency: listings[0].currency,
  };
}
