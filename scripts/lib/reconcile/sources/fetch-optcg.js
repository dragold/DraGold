// DraGold — Catalog Reconciliation Pipeline
// External source fetcher: optcgapi.com, per One Piece EN. STEP 4.
//
// Puramente diagnostico/di lettura. Nessuna scrittura Supabase, nessuna
// scrittura di alcun tipo — solo GET verso optcgapi.com. Nessuna credenziale
// richiesta (API pubblica).
//
// ============================================================================
// LIMITE VERIFICATO (non aggirato, dichiarato esplicitamente): SOLO EN
// ============================================================================
// Verificato 2026-08-17 via fetch diretto della documentazione e di
// `/api/allSets/`:
//   - La homepage di optcgapi.com dichiara esplicitamente: "This data is
//     based off the english release of the One Piece Card Game."
//   - `/api/allSets/` non ha NESSUN campo di lingua/regione (solo
//     set_name/set_id) — non c'è un modo di chiedere una variante JA a questa
//     API, non è un parametro che manca solo nella nostra chiamata.
//   - Confermato anche lato DraGold: le righe reali `cards` con
//     tcg=onepiece lang=ja source=optcg (2.554 righe, verificato via query
//     read-only su Supabase) sono state scritte da `sync-cards.js#syncOnePiece`
//     via scraping diretto dell'HTML Bandai (bandai-onepiece-card.com), NON da
//     questa API — quello scraper è intrecciato con la pipeline di scrittura
//     (fuori scope estrarlo qui, stessa ragione già documentata per TCGdex in
//     fetch-tcgdex.js).
// Conseguenza dichiarata dal design (requisito esplicito del task, "se una
// fonte non è ancora implementata, errore esplicito, mai dati inventati"):
// `fetchOptcgSet({ lang: 'ja' })` lancia SEMPRE `OptcgSourceNotImplementedError`,
// mai un fetch silenzioso su dati EN spacciati per JA e mai un array vuoto.
//
// ============================================================================
// Forma di riga prodotta
// ============================================================================
// Stessa forma "riga cards grezza" attesa da normalize-optcg.js. `card_set_id`
// (es. "OP01-077") è sia `source_id` che `card_number`, verificato reale sia
// nella risposta API (`/api/sets/{set_id}/`) sia nel formato già scritto in
// DB da sync-cards.js (mai un numero puro isolato dal set code, coerente col
// commento già presente in normalize-optcg.js). `set_id` usa il valore
// dell'API così com'è (es. "OP-01", con trattino) — verificato via query
// read-only su Supabase che questo formato COINCIDE già con quello presente
// in DB per i set "OP-*" (es. `cards.set_id = 'OP-01'`, 102 righe), quindi
// nessuna riconciliazione di formato serve per questi set. Nota onesta: il DB
// contiene ANCHE set_id in altre forme per altri prefissi (es. "eb01"
// minuscolo senza trattino per Extra Booster) — questo modulo non inventa una
// regola di conversione per quei casi, riporta il valore della fonte così
// com'è; un disallineamento di set_id per quei prefissi emergerebbe come
// riga non abbinata nel matching a valle, mai nascosto silenziosamente.

const OPTCG_BASE = process.env.OPTCG_BASE_OVERRIDE || 'https://optcgapi.com/api';

/** Lingue per cui questo modulo ha una fonte read-only reale, verificata. */
export const SUPPORTED_LANGS = Object.freeze(['en']);

/** Fetch HTTP fallito (HTTP non-ok, timeout, errore rete, JSON invalido). */
export class OptcgFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OPTCG_FETCH_FAILED';
  }
}

/** Lingua richiesta senza una fonte read-only implementata (es. 'ja'). */
export class OptcgSourceNotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OPTCG_SOURCE_NOT_IMPLEMENTED';
  }
}

async function getJson(url, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(url, { signal: controller.signal });
    } catch (err) {
      throw new OptcgFetchError(`OPTCG_FETCH_FAILED: GET ${url}: ${err.message}`);
    }
    if (!res.ok) {
      throw new OptcgFetchError(`OPTCG_FETCH_FAILED: GET ${url} -> HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new OptcgFetchError(`OPTCG_FETCH_FAILED: GET ${url}: risposta non è JSON valido (${err.message})`);
    }
  } finally {
    clearTimeout(t);
  }
}

/**
 * Converte una card grezza optcgapi.com nella forma "riga cards grezza"
 * attesa dai normalizzatori. Funzione pura — testabile senza rete.
 *
 * @param {{card_name?: string, card_set_id?: string, set_id?: string,
 *   set_name?: string, rarity?: string, card_image?: string}} card
 * @param {string} lang
 * @returns {object}
 */
export function cardToRow(card, lang) {
  return {
    id: null,
    tcg: 'onepiece',
    source: 'optcg',
    source_id: card.card_set_id ?? null,
    set_id: card.set_id ?? null,
    set_name: card.set_name ?? null,
    lang,
    canonical_card_id: null,
    name: card.card_name ?? null,
    name_en: null,
    image_url: card.card_image ?? null,
    image_url_hi: null,
    rarity: card.rarity ?? null,
    print_variant: null,
    card_number: card.card_set_id ?? null,
    _raw: card,
  };
}

/**
 * Legge UN set optcgapi.com per (setId, lang) — sola lettura, un'unica GET.
 * Lingua non supportata (qualunque cosa diversa da 'en'): lancia
 * `OptcgSourceNotImplementedError` PRIMA di fare qualunque richiesta di rete
 * — mai un fetch EN travestito da altra lingua, mai un array vuoto silenzioso.
 *
 * @param {object} opts
 * @param {string} opts.setId - es. 'OP-01' (formato optcgapi.com, verificato
 *   coincidente col DB per i set "OP-*")
 * @param {string} opts.lang - deve essere uno di SUPPORTED_LANGS ('en')
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {number} [opts.timeoutMs=15000]
 * @returns {Promise<{setId: string, lang: string, setName: string|null, rows: object[]}>}
 * @throws {OptcgSourceNotImplementedError} se lang non è supportata
 * @throws {OptcgFetchError} se la richiesta fallisce
 * @throws {TypeError} se setId/lang mancanti
 */
export async function fetchOptcgSet({ setId, lang, fetchImpl = fetch, timeoutMs } = {}) {
  if (!setId || typeof setId !== 'string') {
    throw new TypeError('fetchOptcgSet: "setId" è obbligatorio (stringa non vuota)');
  }
  if (!lang || typeof lang !== 'string') {
    throw new TypeError('fetchOptcgSet: "lang" è obbligatorio (stringa non vuota)');
  }
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new OptcgSourceNotImplementedError(
      `OPTCG_SOURCE_NOT_IMPLEMENTED: nessuna fonte read-only implementata per tcg=onepiece lang=${lang}. ` +
      `optcgapi.com fornisce solo dati in inglese (verificato 2026-08-17, dichiarazione esplicita della fonte + assenza di campo lingua in /api/allSets/). ` +
      `Le righe reali onepiece/ja in DraGold provengono da scraping HTML diretto (sync-cards.js#syncOnePiece), fuori scope per questo fetcher. Nessun dato inventato.`
    );
  }

  const url = `${OPTCG_BASE}/sets/${setId}/`;
  const cardsRaw = await getJson(url, { fetchImpl, timeoutMs });
  const cards = Array.isArray(cardsRaw) ? cardsRaw : [];
  const rows = cards.map((c) => cardToRow(c, lang));
  const setName = rows.find((r) => r.set_name)?.set_name ?? null;
  return { setId, lang, setName, rows };
}
