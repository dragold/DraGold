// DraGold — Catalog Freshness (Fase 1)
// Discovery del catalogo SET Pokémon da TCGdex.
//
// Fonte: https://api.tcgdex.net/v2/{lang}/sets  (lista, senza releaseDate)
//        https://api.tcgdex.net/v2/{lang}/sets/{id}  (detail, con releaseDate/serie)
// Nessuna API key. Verificato 2026-09-02: la lista NON contiene releaseDate/serie,
// solo il detail li ha — quindi la discovery completa richiede 1 GET detail per set.
//
// Sola lettura. Nessuna scrittura, nessun dato inventato: un set senza `name`
// viene scartato (mai un placeholder); un errore di rete propaga come
// TcgdexCatalogError (mai un array vuoto silenzioso).

import { fetchTcgdexSet } from '../../reconcile/sources/fetch-tcgdex.js';
import { cardNumberKey } from '../card-number-key.js';

const TCGDEX_BASE = process.env.TCGDEX_BASE_OVERRIDE || 'https://api.tcgdex.net/v2';
const DETAIL_DELAY_MS = 120;

export class TcgdexCatalogError extends Error {
  constructor(message) { super(message); this.name = 'TCGDEX_CATALOG_FAILED'; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let res;
    try { res = await fetchImpl(url, { signal: ctl.signal }); }
    catch (err) { throw new TcgdexCatalogError(`GET ${url}: ${err.message}`); }
    if (!res.ok) throw new TcgdexCatalogError(`GET ${url} -> HTTP ${res.status}`);
    try { return await res.json(); }
    catch (err) { throw new TcgdexCatalogError(`GET ${url}: JSON non valido (${err.message})`); }
  } finally { clearTimeout(t); }
}

/**
 * Mappa un oggetto set TCGdex (detail o lista) nella forma canonica DraGold.
 * Puro. `releaseDate`/`serie` sono null se assenti (lista senza detail).
 *
 * @param {object} raw
 * @returns {{code:string,name:string|null,releaseDate:string|null,
 *   cardCountOfficial:number|null,cardCountTotal:number|null,
 *   logo:string|null,symbol:string|null,serieId:string|null,serieName:string|null,
 *   abbreviation:string|null}}
 */
export function mapTcgdexSet(raw) {
  const cc = raw?.cardCount || {};
  return {
    code: raw?.id ?? null,
    name: raw?.name ?? null,
    releaseDate: raw?.releaseDate ?? null,
    cardCountOfficial: Number.isFinite(cc.official) ? cc.official : null,
    cardCountTotal: Number.isFinite(cc.total) ? cc.total : null,
    logo: raw?.logo ?? null,
    symbol: raw?.symbol ?? null,
    serieId: raw?.serie?.id ?? null,
    serieName: raw?.serie?.name ?? null,
    abbreviation: raw?.abbreviation ?? null,
  };
}

/**
 * Elenca tutti i set Pokémon per una lingua, arricchiti col detail (releaseDate).
 *
 * @param {string} lang - 'en' | 'ja'
 * @param {{fetchImpl?: typeof fetch, withDetail?: boolean, onProgress?: (n:number,total:number)=>void}} [opts]
 * @returns {Promise<ReturnType<typeof mapTcgdexSet>[]>}
 */
export async function listTcgdexSets(lang, { fetchImpl = fetch, withDetail = true, onProgress } = {}) {
  if (!lang) throw new TypeError('listTcgdexSets: "lang" obbligatorio');
  const list = await getJson(`${TCGDEX_BASE}/${lang}/sets`, { fetchImpl });
  if (!Array.isArray(list)) throw new TcgdexCatalogError(`lista set ${lang}: risposta non e' un array`);

  const seen = new Set();
  const base = list
    .filter((s) => s && s.id && s.name && !seen.has(s.id) && seen.add(s.id))
    .map(mapTcgdexSet);

  if (!withDetail) return base;

  const out = [];
  for (let i = 0; i < base.length; i++) {
    const s = base[i];
    try {
      await sleep(DETAIL_DELAY_MS);
      const detail = await getJson(`${TCGDEX_BASE}/${lang}/sets/${s.code}`, { fetchImpl });
      out.push({ ...s, ...mapTcgdexSet(detail) });
    } catch {
      // Detail non raggiungibile per QUESTO set: teniamo la riga base (senza
      // releaseDate) invece di perdere il set dalla discovery. Il gap "set
      // senza data" e' comunque visibile a valle.
      out.push(s);
    }
    if (onProgress) onProgress(i + 1, base.length);
  }
  return out;
}

/**
 * Numeri carta (chiave normalizzata) di un set TCGdex.
 *
 * @param {string} lang
 * @param {string} code
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<Set<string>>}
 */
export async function listTcgdexSetCardNumbers(lang, code, { fetchImpl = fetch } = {}) {
  const { rows } = await fetchTcgdexSet({ setId: code, lang, fetchImpl });
  const out = new Set();
  for (const r of rows) {
    const key = cardNumberKey('pokemon', r.card_number);
    if (key) out.add(key);
  }
  return out;
}
