// DraGold — Catalog Reconciliation Pipeline
// Supabase read layer. STEP 2 dell'architettura descritta in
// CATALOG_RECOVERY_DRYRUN_DESIGN.md — l'integrazione READ-ONLY che
// reconcile-pokemon.js segnalava come "prossimo step, da autorizzare
// esplicitamente" (vedi il commento in fondo a quel file).
//
// ============================================================================
// GARANZIA DI SOLA LETTURA (non negoziabile, vedi requisiti del task)
// ============================================================================
// Questo modulo non importa né richiama MAI `.insert(`, `.update(`, `.upsert(`
// o `.delete(` sul client Supabase. Le uniche chiamate fatte sul query builder
// sono `.from().select().eq()...order().range()` — una catena di sola lettura.
// Il client Supabase viene sempre ricevuto come parametro (mai istanziato qui
// con `createClient`), quindi:
//   - questo modulo non decide MAI quali credenziali usare (nessun
//     `process.env.SUPABASE_SERVICE_KEY` letto qui — zero rischio di loggare
//     o incapsulare un secret in un errore generato da questo file);
//   - i test possono passare un client finto che registra ogni chiamata e fa
//     fallire il test se compare un metodo di scrittura (vedi
//     `__tests__/supabase-read.test.js`, blocco "garanzia di sola lettura").
//
// Le uniche colonne selezionate sono quelle elencate in DEFAULT_COLUMNS
// (nessun `select('*')`): un `select('*')` esporrebbe silenziosamente ogni
// futura colonna aggiunta a `cards` (comprese eventuali colonne interne non
// pensate per la reconciliation) — esplicito è meglio di implicito qui.
//
// ============================================================================
// Perché generico per i 4 target (Pokémon EN/JA, One Piece EN/JA) e non
// specifico per uno
// ============================================================================
// Le uniche differenze fra i 4 target sono i valori di `tcg`/`lang` passati
// come filtro — non c'è nessuna logica specifica per TCG qui (quella vive nei
// moduli normalize-*.js, a valle). `setId` è opzionale: omesso, la query
// legge l'intero tcg+lang; passato, restringe a un singolo set (utile per lo
// smoke test su un set piccolo richiesto prima di qualunque scan ampio).
//
// ============================================================================
// ORDER BY id + LIMIT/OFFSET su uno scope (tcg,lang) SENZA set_id: verificato
// pericoloso su dati reali, `orderById` esiste per questo (2026-08-17)
// ============================================================================
// Lo smoke test reale (scripts/lib/reconcile/smoke-reconcile.mjs) ha prodotto
// uno statement timeout reale su Supabase per `tcg=pokemon lang=ja offset=0
// limit=1000` con l'ORDER BY id di default. Diagnosticato con EXPLAIN
// (sola lettura, nessuna scrittura/indice toccato) sul progetto reale
// (pimwkmwrduqkaydyvxqz, `cards` = 201.059 righe totali, pokemon/ja = 8.164):
//
//   - CON `ORDER BY id LIMIT 1000`: il planner Postgres usa
//     `Index Scan using cards_pkey` (l'indice su `id`, per soddisfare l'ORDER
//     BY senza un nodo Sort separato) con un `Filter` riga-per-riga su
//     tcg/lang — MAI l'indice composito `cards_tcg_lang_idx` che esiste
//     apposta per questo filtro. Poiché le righe pokemon/ja sono una frazione
//     piccola (~4%) e non correlata con l'ordinamento per `id`, questo piano
//     può degenerare in una scansione di una porzione enorme delle 201k righe
//     totali prima di accumulare 1000 corrispondenze — il costo stimato
//     dall'EXPLAIN (senza ANALYZE) appare basso perché assume una
//     distribuzione uniforme dei match che qui non vale, e in pratica va in
//     timeout.
//   - SENZA ORDER BY: il planner usa correttamente `cards_tcg_lang_idx`
//     (Index Scan diretto sul filtro), verificato veloce.
//   - CON `set_id` nel filtro (query a singolo set, come fetchDbCatalogSlice
//     con `setId`): il planner usa `cards_set_idx` (molto selettivo, poche
//     righe) e poi un `Sort` esplicito su un risultato piccolo (decine di
//     righe) — verificato economico, NESSUN problema in questo caso.
//
// Quindi: `ORDER BY id` resta l'ordinamento di default (comportamento
// invariato per ogni chiamante esistente e per qualunque query già scoped a
// un `set_id`, dove è economico). `orderById: false` è un opt-out esplicito,
// da usare SOLO per query ampie (tcg+lang senza set_id) dove l'ordine non
// serve al chiamante (es. un conteggio/aggregazione per set_id, che è
// invariante rispetto all'ordine delle righe lette) — NON un default globale,
// e NON una soluzione per una futura scansione ordinata dell'intero
// tcg+lang: quel caso resta un problema aperto, esplicitamente NON risolto
// qui (richiederebbe un indice dedicato tcg+lang+id, fuori scope: "non
// creare indici in questa fase" — vedi il task che ha introdotto questo
// commento). Nessun aumento di statement_timeout: questo è un cambio di
// query plan, non un tentativo di sopportare un piano lento più a lungo.



/**
 * Errore tipizzato per una lettura Supabase fallita. Stesso principio già
 * stabilito in `scripts/lib/pokemon-sync.js#SupabaseReadError` (un errore di
 * lettura non è mai "zero righe" — deve propagare, mai essere inghiottito in
 * un array vuoto che verrebbe letto a valle come "nessuna carta esiste").
 * Definito qui localmente (non importato da pokemon-sync.js) perché
 * scripts/lib/reconcile/ è deliberatamente indipendente da pokemon-sync.js
 * (che è pokemon-specific e fa anche scritture) — stesso pattern, zero
 * accoppiamento fra i due moduli.
 */
export class SupabaseReadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SUPABASE_READ_FAILED';
  }
}

// Colonne selezionate: esattamente i campi consumati oggi da
// normalize-tcgdex.js/normalize-ptcg.js/normalize-optcg.js, più `set_name`
// (serve al report Fase 7, "quali set", anche se i normalizzatori non lo
// propagano ancora) e `updated_at` (diagnostico: utile per capire quanto è
// fresca una riga senza dover indovinare). Nessun campo di prezzo/collection/
// alert: fuori scope per la reconciliation del catalogo.
export const DEFAULT_COLUMNS = [
  'id',
  'tcg',
  'source',
  'source_id',
  'set_id',
  'set_name',
  'lang',
  'card_number',
  'canonical_card_id',
  'name',
  'name_en',
  'image_url',
  'image_url_hi',
  'rarity',
  'print_variant',
  'updated_at',
];

const DEFAULT_PAGE_SIZE = 500;

/**
 * Rende sicuro da loggare/propagare un errore ritornato da PostgREST/Supabase.
 * Estrae SOLO i campi noti e testuali (message/code/hint/details) invece di
 * propagare l'oggetto errore grezzo così com'è: un oggetto errore Supabase può
 * in teoria portarsi dietro dettagli della request (mai osservato includere la
 * service key nei casi reali di questo repo, ma non c'è motivo di rischiarlo
 * quando estrarre solo i 4 campi testuali documentati basta a diagnosticare
 * il problema). Nessuna euristica di "redazione" stringa-per-stringa: più
 * semplice e più affidabile selezionare esplicitamente cosa portare fuori,
 * piuttosto che provare a rimuovere retroattivamente cosa non portare.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function safeErrorMessage(error) {
  if (!error) return 'errore sconosciuto';
  if (typeof error === 'string') return error;
  const parts = [];
  if (error.message) parts.push(String(error.message));
  if (error.code) parts.push(`code=${error.code}`);
  if (error.hint) parts.push(`hint=${error.hint}`);
  if (error.details) parts.push(`details=${error.details}`);
  return parts.length ? parts.join(' | ') : 'errore sconosciuto (nessun campo testuale riconosciuto)';
}

/**
 * Valida i parametri comuni a fetchCardsPage/fetchAllCardsForReconciliation.
 * Centralizzato per non duplicare gli stessi controlli in due funzioni.
 *
 * @param {object} params
 */
function assertValidScope({ client, tcg, lang }) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('supabase-read: "client" deve essere un client Supabase (o un mock) con un metodo .from()');
  }
  if (!tcg || typeof tcg !== 'string') {
    throw new TypeError('supabase-read: "tcg" è obbligatorio (stringa non vuota)');
  }
  if (!lang || typeof lang !== 'string') {
    throw new TypeError('supabase-read: "lang" è obbligatorio (stringa non vuota)');
  }
}

/**
 * Legge UNA pagina di `cards` per (tcg, lang[, set_id]). Sola lettura:
 * .from('cards').select(columns).eq(...).range(offset, offset+limit-1).
 * Non decide da sola quando fermarsi — quello è compito del chiamante
 * (fetchAllCardsForReconciliation qui sotto, o un orchestratore futuro che
 * vuole streammare pagina per pagina invece di accumulare tutto in memoria).
 *
 * @param {object} client - client Supabase (deve esporre .from())
 * @param {object} opts
 * @param {string} opts.tcg - es. 'pokemon' | 'onepiece'
 * @param {string} opts.lang - es. 'en' | 'ja'
 * @param {string|null} [opts.setId] - se presente, restringe a un set
 * @param {number} [opts.offset=0]
 * @param {number} [opts.limit=500]
 * @param {string[]} [opts.columns=DEFAULT_COLUMNS]
 * @param {boolean} [opts.orderById=true] - false SOLO per query ampie senza
 *   `setId` dove l'ordine non serve al chiamante (vedi il commento
 *   "ORDER BY id + LIMIT/OFFSET..." in testa al file per il perché). Quando
 *   `setId` è presente l'ordinamento per id resta sempre economico — questa
 *   opzione esiste per lo scope largo (tcg+lang), non per quello scoped.
 * @returns {Promise<{rows: object[], hasMore: boolean}>}
 * @throws {SupabaseReadError} se la lettura fallisce
 * @throws {TypeError} se i parametri sono invalidi
 */
export async function fetchCardsPage(client, opts = {}) {
  const {
    tcg,
    lang,
    setId = null,
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
    columns = DEFAULT_COLUMNS,
    orderById = true,
  } = opts;

  assertValidScope({ client, tcg, lang });
  if (!Number.isInteger(offset) || offset < 0) {
    throw new TypeError('supabase-read: "offset" deve essere un intero >= 0');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new TypeError('supabase-read: "limit" deve essere un intero > 0');
  }

  let query = client.from('cards').select(columns.join(',')).eq('tcg', tcg).eq('lang', lang);
  if (setId) query = query.eq('set_id', setId);
  if (orderById) query = query.order('id', { ascending: true });
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    const where = `tcg=${tcg} lang=${lang}${setId ? ` set_id=${setId}` : ''} offset=${offset} limit=${limit}`;
    throw new SupabaseReadError(`SUPABASE_READ_FAILED: lettura cards fallita (${where}): ${safeErrorMessage(error)}`);
  }

  const rows = data || [];
  return { rows, hasMore: rows.length === limit };
}

/**
 * Legge TUTTE le righe `cards` per (tcg, lang[, set_id]), paginando
 * automaticamente con `fetchCardsPage` finché una pagina torna meno righe del
 * `pageSize` richiesto (segnale di fine risultati — evita di dover fare
 * affidamento su un count separato, che sarebbe una query in più e una fonte
 * di disallineamento se il conteggio cambia fra le due chiamate).
 *
 * Necessaria perché `public.cards` può superare ampiamente il limite di
 * risposta di default di PostgREST/Supabase (verificato: pokemon/en da solo
 * supera le 44.000 righe fra le due fonti — vedi Fase 1 del design doc) — una
 * singola `.select()` senza `.range()` verrebbe silenziosamente troncata.
 *
 * `onPage`, se fornito, viene invocato dopo ogni pagina con `(rows, pageInfo)`
 * — hook pensato per un futuro consumo incrementale/checkpointed (Fase 8),
 * non implementato qui: questa funzione di per sé continua ad accumulare e
 * restituire l'array completo, l'hook è puramente osservazionale.
 *
 * @param {object} client
 * @param {object} opts - stessi di fetchCardsPage, meno offset (gestito qui) —
 *   incluso `orderById` (default true), passato invariato a ogni pagina.
 * @param {number} [opts.pageSize=500]
 * @param {(rows: object[], pageInfo: {offset:number, pageIndex:number}) => void} [opts.onPage]
 * @param {number} [opts.maxPages] - safety cap opzionale (nessun default: un
 *   run di reconciliation legittimo può avere più pagine di un valore basso
 *   arbitrario; un cap va scelto esplicitamente dal chiamante se vuole
 *   proteggersi da un loop indefinito su un bug del server che ripetesse
 *   sempre la stessa pagina piena)
 * @returns {Promise<object[]>}
 * @throws {SupabaseReadError} se una qualunque pagina fallisce
 */
export async function fetchAllCardsForReconciliation(client, opts = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, onPage = null, maxPages = null, ...rest } = opts;
  assertValidScope({ client, tcg: rest.tcg, lang: rest.lang });
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new TypeError('supabase-read: "pageSize" deve essere un intero > 0');
  }
  if (maxPages != null && (!Number.isInteger(maxPages) || maxPages <= 0)) {
    throw new TypeError('supabase-read: "maxPages" deve essere un intero > 0 se fornito');
  }

  const all = [];
  let offset = 0;
  let pageIndex = 0;

  while (true) {
    const { rows, hasMore } = await fetchCardsPage(client, { ...rest, offset, limit: pageSize });
    all.push(...rows);
    if (onPage) onPage(rows, { offset, pageIndex });
    pageIndex += 1;

    if (!hasMore) break;
    if (maxPages != null && pageIndex >= maxPages) break;
    offset += pageSize;
  }

  return all;
}

/**
 * Scorciatoia per lo scope più comune della reconciliation (Fase 3): legge
 * tutte le righe di un singolo (tcg, lang), opzionalmente un solo set — stessa
 * cosa di fetchAllCardsForReconciliation, nome più esplicito per chi chiama
 * dall'orchestratore senza dover conoscere il dettaglio di paginazione.
 *
 * @param {object} client
 * @param {{tcg: string, lang: string, setId?: string|null, pageSize?: number}} scope
 * @returns {Promise<object[]>}
 */
export async function fetchDbCatalogSlice(client, scope) {
  return fetchAllCardsForReconciliation(client, scope);
}
