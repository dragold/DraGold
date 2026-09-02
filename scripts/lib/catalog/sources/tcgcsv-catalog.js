// DraGold — Catalog Freshness (Fase 1)
// Discovery del catalogo One Piece (set + carte + prezzi) da TCGCSV.
//
// Fonte: https://tcgcsv.com/tcgplayer/{categoryId}/groups
//        https://tcgcsv.com/tcgplayer/{categoryId}/{groupId}/products
//        https://tcgcsv.com/tcgplayer/{categoryId}/{groupId}/prices
// Aggiornamento: 1x/giorno ~20:00 UTC. Nessuna API key.
//
// IMPORTANTE (verificato 2026-09-02): TCGCSV blocca lo User-Agent di default di
// Node ("node") con HTTP 401. Serve uno UA descrittivo -> CATALOG_UA.
//
// categoryId: One Piece = 68, Pokémon = 3, Pokémon Japan = 85, MTG = 1, YGO = 2.

export const TCGCSV_CATEGORY = Object.freeze({
  onepiece: 68, pokemon: 3, pokemon_ja: 85, mtg: 1, ygo: 2,
});

const TCGCSV_BASE = process.env.TCGCSV_BASE_OVERRIDE || 'https://tcgcsv.com/tcgplayer';
const CATALOG_UA = 'DraGold-CatalogBot/1.0 (+https://dragold.org; catalog freshness monitor)';

export class TcgcsvFetchError extends Error {
  constructor(message) { super(message); this.name = 'TCGCSV_FETCH_FAILED'; }
}

async function getResultsOnce(url, { fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(url, { signal: ctl.signal, headers: { 'user-agent': CATALOG_UA, accept: 'application/json' } });
    } catch (err) {
      throw new TcgcsvFetchError(`GET ${url}: ${err.message}`);
    }
    if (!res.ok) throw new TcgcsvFetchError(`GET ${url} -> HTTP ${res.status}`);
    let body;
    try { body = await res.json(); }
    catch (err) { throw new TcgcsvFetchError(`GET ${url}: JSON non valido (${err.message})`); }
    if (!body || !Array.isArray(body.results)) {
      throw new TcgcsvFetchError(`GET ${url}: manca "results" nella risposta`);
    }
    return body.results;
  } finally { clearTimeout(t); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry con backoff — errori di rete transienti da CI.
async function getResults(url, opts = {}) {
  const attempts = opts.attempts ?? 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await getResultsOnce(url, opts); }
    catch (err) { lastErr = err; if (i < attempts - 1) await sleep(800 * (i + 1)); }
  }
  throw lastErr;
}

/** Valore di un campo `extendedData` per nome. Puro. */
export function extFieldValue(extendedData, name) {
  if (!Array.isArray(extendedData)) return null;
  const hit = extendedData.find((e) => e && e.name === name);
  return hit && hit.value != null ? String(hit.value) : null;
}

/** Mappa un group TCGCSV. Puro. */
export function mapTcgcsvGroup(raw) {
  return {
    groupId: raw?.groupId ?? null,
    name: raw?.name ?? null,
    abbreviation: raw?.abbreviation ?? null,
    publishedOn: raw?.publishedOn ? String(raw.publishedOn).slice(0, 10) : null,
    isSupplemental: Boolean(raw?.isSupplemental),
  };
}

/** Mappa un product TCGCSV in forma carta-grezza. Puro. */
export function mapTcgcsvProduct(raw) {
  return {
    productId: raw?.productId ?? null,
    name: raw?.name ?? null,
    number: extFieldValue(raw?.extendedData, 'Number'),
    rarity: extFieldValue(raw?.extendedData, 'Rarity'),
    imageUrl: raw?.imageUrl ?? null,
    releasedOn: raw?.presaleInfo?.releasedOn ? String(raw.presaleInfo.releasedOn).slice(0, 10) : null,
    raw,
  };
}

/**
 * @param {number} categoryId
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<ReturnType<typeof mapTcgcsvGroup>[]>}
 */
export async function listTcgcsvGroups(categoryId, { fetchImpl = fetch } = {}) {
  const results = await getResults(`${TCGCSV_BASE}/${categoryId}/groups`, { fetchImpl });
  return results.map(mapTcgcsvGroup).filter((g) => g.groupId != null && g.name);
}

/**
 * @param {number} categoryId
 * @param {number|string} groupId
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<ReturnType<typeof mapTcgcsvProduct>[]>}
 */
export async function listTcgcsvGroupCards(categoryId, groupId, { fetchImpl = fetch } = {}) {
  const results = await getResults(`${TCGCSV_BASE}/${categoryId}/${groupId}/products`, { fetchImpl });
  return results.map(mapTcgcsvProduct).filter((p) => p.productId != null);
}

/**
 * @param {number} categoryId
 * @param {number|string} groupId
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<Map<string, {subType:string,market:number|null,low:number|null,mid:number|null,high:number|null}[]>>}
 */
export async function listTcgcsvGroupPrices(categoryId, groupId, { fetchImpl = fetch } = {}) {
  const results = await getResults(`${TCGCSV_BASE}/${categoryId}/${groupId}/prices`, { fetchImpl });
  const byProduct = new Map();
  for (const r of results) {
    const pid = String(r.productId);
    const entry = {
      subType: r.subTypeName ?? 'Normal',
      market: Number.isFinite(r.marketPrice) ? r.marketPrice : null,
      low: Number.isFinite(r.lowPrice) ? r.lowPrice : null,
      mid: Number.isFinite(r.midPrice) ? r.midPrice : null,
      high: Number.isFinite(r.highPrice) ? r.highPrice : null,
    };
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push(entry);
  }
  return byProduct;
}
