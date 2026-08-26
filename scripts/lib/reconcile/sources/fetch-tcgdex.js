// DraGold — Catalog Reconciliation Pipeline
// External source fetcher: TCGdex, per Pokémon EN/JA. STEP 4.
//
// Puramente diagnostico/di lettura. Nessuna scrittura Supabase, nessuna
// scrittura di alcun tipo — solo GET verso TCGdex. Nessuna credenziale
// richiesta (API pubblica).
//
// ============================================================================
// Perché un modulo NUOVO invece di riusare scripts/sync-cards.js
// ============================================================================
// scripts/sync-cards.js contiene già logica di fetch TCGdex (TCGDEX_BASE,
// safeFetch, il fetch di set/card in syncPokemon()), ma è strutturalmente
// intrecciata con la pipeline di scrittura: processSetCards() chiama sempre
// mergeRow()/upsertBatch() subito dopo aver ottenuto i dati, e safeFetch()
// stessa non è pensata per essere isolata da quel flusso senza modificare
// sync-cards.js (fuori scope: non tocchiamo sync-cards.js). Estrarre "solo il
// fetch" da lì richiederebbe comunque riscrivere l'interfaccia — a quel punto
// è più onesto un modulo nuovo, minimo, dichiaratamente di sola lettura, che
// riproduce la STESSA forma di richiesta HTTP già verificata funzionante in
// sync-cards.js (stesso base URL, stessa forma di endpoint), senza duplicare
// alcuna logica di merge/upsert.
//
// Cosa NON fa questo modulo: retry con backoff, rate limiting persistente fra
// più chiamate. TCGdex qui viene interrogato con GRANULARITÀ DI UN SET PER
// CHIAMATA (un solo `GET /{lang}/sets/{setId}`, che secondo la forma REST
// TCGdex già verificata in sync-cards.js include l'intero array `cards` del
// set con i campi necessari alla reconciliation — niente fetch per-carta
// aggiuntivo, a differenza di sync-cards.js che fa un fetch di dettaglio extra
// per riga quando decide di aggiornarla). Per lo scope richiesto ora (un set
// piccolo alla volta, orchestrato da reconcile-catalog.mjs) questo basta;
// un rate limiter multi-richiesta è responsabilità dell'orchestrator quando
// itera su più set, non di questo fetcher a set singolo.
//
// Forma di riga prodotta: la STESSA forma "riga cards grezza" attesa in
// ingresso da normalize-tcgdex.js (id, tcg, source, source_id, set_id, lang,
// card_number, name, image_url, image_url_hi, rarity, ...) — `id` è
// deliberatamente null (queste righe non esistono ancora in Supabase, non è
// un id inventato), e `canonical_card_id`/`print_variant` sono null per lo
// stesso motivo (la fonte esterna non li ha).

const TCGDEX_BASE = process.env.TCGDEX_BASE_OVERRIDE || 'https://api.tcgdex.net/v2';

/**
 * Errore tipizzato per un fetch TCGdex fallito (HTTP non-ok, timeout, errore
 * di rete, JSON non parsabile) — mai inghiottito in un array vuoto, che a
 * valle verrebbe letto come "il set non ha carte" invece che "non siamo
 * riusciti a leggerlo".
 */
export class TcgdexFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TCGDEX_FETCH_FAILED';
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
      throw new TcgdexFetchError(`TCGDEX_FETCH_FAILED: GET ${url}: ${err.message}`);
    }
    if (!res.ok) {
      throw new TcgdexFetchError(`TCGDEX_FETCH_FAILED: GET ${url} -> HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new TcgdexFetchError(`TCGDEX_FETCH_FAILED: GET ${url}: risposta non è JSON valido (${err.message})`);
    }
  } finally {
    clearTimeout(t);
  }
}

/**
 * Converte un card brief TCGdex (elemento di `setData.cards`) nella forma
 * "riga cards grezza" attesa dai normalizzatori, per un dato set/lang.
 * Funzione pura (nessun I/O) — separata apposta per essere testabile senza
 * rete, passando un brief costruito a mano.
 *
 * Regola per image_url/image_url_hi: STESSA convenzione già verificata in
 * `scripts/lib/pokemon-sync.js#buildIncomingFromBrief` (`image + '/low.webp'`
 * / `image + '/high.webp'`) — non una nuova regola inventata qui.
 *
 * @param {{id?: string, localId?: string|number, name?: string, image?: string, rarity?: string}} brief
 * @param {{id: string}} setMeta
 * @param {{name?: string|null}} setData
 * @param {string} lang
 * @returns {object}
 */
export function briefToRow(brief, setMeta, setData, lang) {
  const localId = brief.localId ?? brief.id;
  return {
    id: null,
    tcg: 'pokemon',
    source: 'tcgdex',
    source_id: `${setMeta.id}-${localId}`,
    set_id: setMeta.id,
    set_name: setData?.name ?? setMeta.name ?? null,
    lang,
    canonical_card_id: null,
    name: brief.name ?? null,
    name_en: null,
    image_url: brief.image ? `${brief.image}/low.webp` : null,
    image_url_hi: brief.image ? `${brief.image}/high.webp` : null,
    rarity: brief.rarity ?? null,
    print_variant: null,
    card_number: localId != null ? String(localId) : null,
    _raw: brief,
  };
}

/**
 * Legge UN set TCGdex per (setId, lang) — sola lettura, un'unica GET.
 * Mai dati inventati: se la fonte risponde 404/errore, propaga
 * TcgdexFetchError invece di restituire un set vuoto (che verrebbe letto a
 * valle come "il set esiste ed è vuoto", falso).
 *
 * @param {object} opts
 * @param {string} opts.setId - es. 'svp' (stesso set_id usato da TCGdex/DraGold)
 * @param {string} opts.lang - 'en' | 'ja' (qualunque lingua supportata da TCGdex；
 *   questo modulo non restringe la lista, la restrizione a EN/JA è decisione
 *   del chiamante/orchestratore, coerente con lo scope della reconciliation)
 * @param {typeof fetch} [opts.fetchImpl=fetch]
 * @param {number} [opts.timeoutMs=15000]
 * @returns {Promise<{setId: string, lang: string, setName: string|null, rows: object[]}>}
 * @throws {TcgdexFetchError}
 * @throws {TypeError} se setId/lang mancanti
 */
export async function fetchTcgdexSet({ setId, lang, fetchImpl = fetch, timeoutMs } = {}) {
  if (!setId || typeof setId !== 'string') {
    throw new TypeError('fetchTcgdexSet: "setId" è obbligatorio (stringa non vuota)');
  }
  if (!lang || typeof lang !== 'string') {
    throw new TypeError('fetchTcgdexSet: "lang" è obbligatorio (stringa non vuota)');
  }
  const url = `${TCGDEX_BASE}/${lang}/sets/${setId}`;
  const setData = await getJson(url, { fetchImpl, timeoutMs });
  const setMeta = { id: setId, name: setData?.name ?? null };
  const briefs = Array.isArray(setData?.cards) ? setData.cards : [];
  const rows = briefs.map((brief) => briefToRow(brief, setMeta, setData, lang));
  return { setId, lang, setName: setData?.name ?? null, rows };
}
