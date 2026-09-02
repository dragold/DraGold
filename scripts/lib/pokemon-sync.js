/**
 * DraGold — logica pura per l'ingestion Pokemon TCGdex (hardening pipeline).
 *
 * Nessuna funzione qui fa fetch di rete o chiamate Supabase: sono tutte funzioni
 * pure, testabili senza mock pesanti. `scripts/sync-cards.js` importa questo
 * modulo e si occupa solo di I/O (fetch TCGdex, lettura/scrittura Supabase).
 *
 * Perché esiste questo file separato: le regole di merge/diff/classificazione
 * sono esattamente la parte che deve essere testata a fondo (requisito 8 del
 * task di hardening) — estrarle da uno script con side-effect a livello di
 * modulo (create client Supabase, process.exit su env mancanti) è l'unico modo
 * di scriverci sopra dei unit test reali senza mockare tutto il processo.
 */

// Campi che questo script possiede e può scrivere su `cards` per Pokemon via
// TCGdex. Elenco esplicito e chiuso: qualsiasi campo non in questa lista non
// viene mai toccato dal merge, a prescindere da cosa contiene la riga esistente
// o il payload in arrivo (in particolare: mai `canonical_card_id` o altri campi
// `canonical_*`, mai campi di collection/prezzo/alert).
export const MANAGED_FIELDS = [
  'name', 'set_id', 'set_name', 'card_number',
  'rarity', 'illustrator',
  'image_url', 'image_url_hi',
  'series_id', 'series_name',
  'print_variant',
]

// Campi che richiedono il fetch "detail" (Card completo, non CardBrief) per
// essere popolati in modo affidabile. Usati da needsDetailFetch per decidere
// se una carta già presente ha "metadata mancanti". `print_variant` è
// deliberatamente ESCLUSO da questo elenco: può restare `null` per sempre per
// via del gap di rappresentazione descritto in resolvePrintVariant, e usarlo
// come trigger di re-fetch causerebbe un re-fetch infinito delle carte con
// finish multipli — vedi commento su resolvePrintVariant.
const DETAIL_ONLY_FIELDS = ['rarity', 'illustrator']

/**
 * Una riga esistente è "incompleta" se le manca uno dei campi che solo il
 * detail fetch può popolare. Estratta da `needsDetailFetch` (di cui era già
 * la condizione centrale) per essere riusata anche dal report diagnostico
 * (`incomplete_cards` nel summary) senza duplicare la stessa lista di campi
 * in due posti (task "DRY-RUN SAFETY + REPORT HARDENING", requisito 3).
 *
 * Una carta senza riga esistente (`existingRow` falsy) non è "incompleta":
 * è NEW, una categoria diversa — vedi classifyRow.
 *
 * @param {object|null|undefined} existingRow
 * @returns {boolean}
 */
export function isIncompleteRow(existingRow) {
  if (!existingRow) return false
  return DETAIL_ONLY_FIELDS.some(f => existingRow[f] === null || existingRow[f] === undefined)
}

/**
 * Costruisce l'id di riga usato da questo script per le carte Pokemon/TCGdex.
 * Stesso formato usato da sempre in `cards.id`, isolato qui solo per essere
 * riusabile nei test senza duplicare la stringa a mano.
 */
export function buildCardId(setId, localId, lang) {
  return `pokemon:tcgdex:${setId}-${localId}:${lang}`
}

/**
 * Interpreta l'oggetto `variants` restituito da TCGdex per una carta
 * (https://tcgdex.dev/reference/card#variants — booleani `normal`, `reverse`,
 * `holo`, `firstEdition`, più eventuali chiavi non documentate come `wPromo`).
 *
 * GAP DI SCHEMA DOCUMENTATO (requisito 5 — non risolto qui, non risolvibile
 * senza migration): `cards.print_variant` è una singola colonna testo per
 * riga. Una carta TCGdex può avere PIÙ finish disponibili contemporaneamente
 * per lo stesso numero/lingua (es. `normal:true` E `reverse:true`): questo
 * significa "esistono entrambe le stampe fisiche", non "questa riga è la
 * stampa X". Lo schema attuale ha UNA riga per (carta, lingua, fonte), non una
 * riga per stampa fisica — quindi non esiste un modo corretto di scrivere
 * "normal e reverse insieme" in un singolo valore scalare senza inventare una
 * codifica (es. il precedente "normal,reverse" della versione non-hardened di
 * questo script, esplicitamente scartato: un valore concatenato non è né un
 * enum leggibile a valle né una vera rappresentazione di due stampe distinte).
 *
 * Comportamento qui:
 *   - `variants` assente/non oggetto            -> { value: null, ambiguous: false, present: false, availableFinishes: [] }
 *   - nessuna chiave `true`                      -> { value: null, ambiguous: false, present: true,  availableFinishes: [] }
 *   - esattamente una chiave `true`              -> { value: <quella chiave>, ambiguous: false, present: true, availableFinishes: [<quella chiave>] }
 *   - più di una chiave `true`                   -> { value: null, ambiguous: true, present: true, availableFinishes: [...] }
 *
 * Il caso "ambiguous" NON scrive nulla (value: null) — il chiamante deve
 * riportarlo come warning nel report, non silenziarlo e non inventare una
 * scelta arbitraria (es. "prendi la prima in ordine alfabetico" sarebbe un
 * dato inventato, esplicitamente vietato dal task precedente e da questo).
 *
 * @param {object|undefined|null} variants
 * @returns {{value: string|null, ambiguous: boolean, present: boolean, availableFinishes: string[]}}
 */
export function resolvePrintVariant(variants) {
  if (!variants || typeof variants !== 'object') {
    return { value: null, ambiguous: false, present: false, availableFinishes: [] }
  }
  const trueKeys = Object.entries(variants)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort()

  if (trueKeys.length === 0) return { value: null, ambiguous: false, present: true, availableFinishes: [] }
  if (trueKeys.length === 1) return { value: trueKeys[0], ambiguous: false, present: true, availableFinishes: trueKeys }
  return { value: null, ambiguous: true, present: true, availableFinishes: trueKeys }
}

/**
 * Errore tipizzato per una lettura Supabase fallita in fase di discovery righe
 * esistenti (task "DRY-RUN SAFETY + REPORT HARDENING", requisito 1). Esiste
 * solo per essere riconoscibile (`err.name === 'SUPABASE_READ_FAILED'`) al
 * livello che stampa il report finale, così il run può essere etichettato
 * esplicitamente come BLOCKED_RUN invece di un generico "Errore critico".
 */
export class SupabaseReadError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SUPABASE_READ_FAILED'
  }
}

/**
 * Interpreta il risultato grezzo di una `select` Supabase su `cards` per un
 * set+lingua, applicando la regola non negoziabile del requisito 1: un errore
 * di lettura NON È "nessuna riga esistente". Prima di questa funzione,
 * `scripts/sync-cards.js` faceva `if (error) { console.warn(...); return new
 * Map() }` — un fail-silent che classificava ogni carta come NEW e permetteva
 * scritture su dati potenzialmente già esistenti. Qui un `error` non-null
 * lancia sempre `SupabaseReadError`, mai una Map vuota.
 *
 * Pura (nessun I/O): riceve l'output già ottenuto dalla query, non la esegue.
 * `canonical_card_id` viene letto SOLO per calcolare `canonicalIds` (usato dal
 * report per il flag `canonicalProtected`) e viene sempre rimosso dalla riga
 * prima di finire nella Map usata per il merge — `assertNoCanonicalFields`
 * resta quindi valida come rete di sicurezza sulle righe effettivamente usate
 * per scrivere.
 *
 * @param {Array<object>|null} data
 * @param {{message?: string}|null} error
 * @param {{setId?: string, lang?: string}} [ctx]
 * @returns {{map: Map<string, object>, canonicalIds: Set<string>}}
 * @throws {SupabaseReadError} se `error` è presente
 */
export function processSupabaseReadResult(data, error, ctx = {}) {
  if (error) {
    const where = ctx.setId && ctx.lang ? ` per ${ctx.setId}/${ctx.lang}` : ''
    throw new SupabaseReadError(`SUPABASE_READ_FAILED: lettura righe esistenti fallita${where}: ${error.message || error}`)
  }
  const map = new Map()
  const canonicalIds = new Set()
  for (const row of data || []) {
    if (row.canonical_card_id != null) canonicalIds.add(row.id)
    const { canonical_card_id, ...safeRow } = row
    assertNoCanonicalFields(safeRow)
    map.set(row.id, safeRow)
  }
  return { map, canonicalIds }
}

/**
 * Verifica che una riga (in scrittura) non contenga MAI un campo `canonical_*`.
 * Difesa attiva, non solo statica: va chiamata subito prima di ogni upsert.
 * Lancia un errore (non ritorna un booleano) perché un canonical field nel
 * payload è un bug di programmazione da far fallire rumorosamente, non da
 * loggare e ignorare — è esattamente il tipo di errore che questo hardening
 * task chiede di rendere strutturalmente impossibile.
 *
 * @param {object} row
 * @throws {Error} se un campo canonical_* è presente
 */
export function assertNoCanonicalFields(row) {
  const bad = Object.keys(row || {}).filter(k => k.toLowerCase().startsWith('canonical'))
  if (bad.length) {
    throw new Error(`assertNoCanonicalFields: campo(i) canonical_* nel payload, vietato: ${bad.join(', ')}`)
  }
}

/**
 * Verifica che `identity` contenga tutti i campi non-derivabili che
 * `public.cards` richiede NOT NULL senza default: `id`, `lang`, `tcg`,
 * `source`, `source_id`.
 *
 * FIX (bug strutturale trovato in audit — vedi IMAGE_AUDIT_REPORT):
 * prima di questo fix, `mergeRow` scriveva `source`/`source_id` SOLO se
 * presenti nella riga esistente (`existingRow`), perché non facevano parte
 * di `MANAGED_FIELDS` e non venivano mai presi da `identity`. Per una carta
 * NEW (nessuna riga esistente) questo produceva una riga upsert priva di
 * `source`/`source_id` — colonne `NOT NULL` senza default in produzione —
 * causando un fallimento del vincolo NOT NULL sull'intero batch di upsert
 * (fino a 100 righe, comprese le UPDATED legittime nello stesso batch).
 *
 * Stessa filosofia di `assertNoCanonicalFields`: fallire rumorosamente qui,
 * non scrivere silenziosamente una riga incompleta e scoprirlo solo
 * dall'errore Postgres a valle.
 *
 * @param {{id?: string, lang?: string, tcg?: string, source?: string, source_id?: string}} identity
 * @throws {Error} se un campo identity obbligatorio manca/è vuoto
 */
export function assertCompleteIdentity(identity) {
  const required = ['id', 'lang', 'tcg', 'source', 'source_id']
  const missing = required.filter(f => identity == null || identity[f] == null || identity[f] === '')
  if (missing.length) {
    throw new Error(`assertCompleteIdentity: campo(i) identity mancante(i)/vuoto(i), upsert bloccato prima della scrittura: ${missing.join(', ')}`)
  }
}

/**
 * Unisce la riga esistente in DB (può essere `null`/`undefined` se la carta è
 * nuova) con i valori "in arrivo" da TCGdex per questa passata, applicando la
 * regola non negoziabile del requisito 4: un campo assente/null/undefined nel
 * payload in arrivo NON cancella mai un valore già valido in DB.
 *
 * Non è un merge generico: opera SOLO sui MANAGED_FIELDS. `id`, `lang`, `tcg`
 * sono presi da `identity` (sempre deterministici, mai ambigui, mai assenti).
 * Nessun campo canonical_* viene mai letto da `existingRow` né scritto nel
 * risultato — vedi anche assertNoCanonicalFields, chiamato qui come rete di
 * sicurezza aggiuntiva prima del return.
 *
 * `identity` deve includere anche `source`/`source_id` (FIX bug strutturale,
 * vedi `assertCompleteIdentity`): sono, come `id`/`lang`/`tcg`, campi di
 * identità deterministici per questa pipeline (sempre `'tcgdex'` + l'id
 * carta lato TCGdex), MAI derivati da `existingRow`/`incoming` — un valore
 * `source` esistente in DB non viene mai "mergiato", viene sempre
 * sovrascritto con quello deciso da chi orchestra il fetch (idempotente:
 * per questa pipeline è sempre `'tcgdex'`, non introduce drift).
 *
 * @param {object|null|undefined} existingRow - riga letta da `cards` (o null se nuova)
 * @param {object} incoming - valori calcolati in questa passata, alcuni possono essere null/undefined
 * @param {{id: string, lang: string, tcg: string, source: string, source_id: string}} identity
 * @returns {object} riga finale pronta per upsert (mai contiene canonical_*)
 * @throws {Error} se identity è incompleta (vedi assertCompleteIdentity) — mai un upsert silenziosamente incompleto
 */
export function mergeRow(existingRow, incoming, identity) {
  assertCompleteIdentity(identity)
  const merged = {
    id: identity.id,
    lang: identity.lang,
    tcg: identity.tcg,
    source: identity.source,
    source_id: identity.source_id,
  }
  for (const field of MANAGED_FIELDS) {
    const incomingVal = incoming ? incoming[field] : undefined
    if (incomingVal !== null && incomingVal !== undefined) {
      merged[field] = incomingVal
    } else {
      merged[field] = existingRow ? (existingRow[field] ?? null) : null
    }
  }
  assertNoCanonicalFields(merged)
  return merged
}

/**
 * Confronta la riga esistente con la riga risultante dal merge e classifica
 * l'esito. Usata sia per il report --dry-run sia (in futuro, non in questa
 * sessione) per decidere se vale la pena fare l'upsert reale.
 *
 * @param {object|null|undefined} existingRow
 * @param {object} mergedRow - output di mergeRow
 * @returns {{classification: 'NEW'|'UPDATED'|'UNCHANGED', changes: Array<{field:string, before:*, after:*}>}}
 */
export function classifyRow(existingRow, mergedRow) {
  if (!existingRow) {
    const changes = MANAGED_FIELDS
      .filter(f => mergedRow[f] !== null && mergedRow[f] !== undefined)
      .map(f => ({ field: f, before: null, after: mergedRow[f] }))
    return { classification: 'NEW', changes }
  }
  const changes = []
  for (const field of MANAGED_FIELDS) {
    const before = existingRow[field] ?? null
    const after = mergedRow[field] ?? null
    if (before !== after) changes.push({ field, before, after })
  }
  return { classification: changes.length ? 'UPDATED' : 'UNCHANGED', changes }
}

/**
 * Costruisce i campi "in arrivo" ottenibili dallo stadio 1 (discovery): il
 * CardBrief dentro la risposta di `GET /v2/{lang}/sets/{id}` (solo
 * `id`,`localId`,`name`,`image` — https://tcgdex.dev/reference/card-brief) più
 * i metadata a livello di set (`setData.name`, `setData.serie`).
 *
 * Non include MAI `rarity`/`illustrator`/`print_variant`: il CardBrief non li
 * espone in modo garantito (vedi header del task di hardening). Lasciarli
 * fuori dall'oggetto (`undefined`, non `null`) è intenzionale: `mergeRow`
 * tratta "chiave assente" come "non toccare il valore esistente", esattamente
 * il comportamento richiesto quando non abbiamo ancora chiamato il detail.
 *
 * @param {{localId: string|number, name: string, image?: string}} cardBrief
 * @param {{id: string, name?: string}} setMeta - dal SetBrief/Set di lista
 * @param {{name?: string, serie?: {id?: string, name?: string}}} setData - dal Set completo (/sets/{id})
 * @returns {object}
 */
export function buildIncomingFromBrief(cardBrief, setMeta, setData) {
  return {
    name: cardBrief.name,
    // Normalizzato a minuscolo: TCGdex restituisce l'id dello stesso set con
    // casing diverso a seconda dell'endpoint/lingua interrogato (verificato
    // dal vivo 2026-09-02: /en/sets -> "sv10", /ja/sets -> "SV10" per lo
    // stesso set) — vedi supabase/migrations/20260902140000_dedupe_ja_set_id_casing.sql.
    set_id: String(setMeta.id || '').toLowerCase(),
    set_name: setData?.name || setMeta.name || null,
    card_number: String(cardBrief.localId),
    image_url: cardBrief.image ? `${cardBrief.image}/high.webp` : null,
    image_url_hi: cardBrief.image ? `${cardBrief.image}/high.webp` : null,
    series_id: setData?.serie?.id || null,
    series_name: setData?.serie?.name || null,
  }
}

/**
 * Costruisce i campi "in arrivo" ottenibili SOLO dallo stadio 2 (enrichment):
 * il Card completo da `GET /v2/{lang}/cards/{id}`
 * (https://tcgdex.dev/reference/card), chiamato solo quando needsDetailFetch
 * lo richiede. Ritorna sempre le tre chiavi (anche se `null`) perché a questo
 * punto il detail è stato davvero interrogato: un `rarity: null` qui significa
 * "TCGdex non ha una rarità per questa carta in questa risposta", non "non
 * l'abbiamo chiesta".
 *
 * ATTENZIONE (scelta deliberatamente conservativa, coerente col requisito 4
 * preso alla lettera larga — "non cancellare un valore già valido" — invece
 * che alla lettera stretta — "solo se il campo è assente"): `mergeRow` NON
 * distingue "null perché il detail non ha trovato nulla" da "campo assente
 * perché non abbiamo chiamato il detail". In entrambi i casi un valore già
 * valido in DB resta protetto. Motivo: un `rarity: null` dopo che in
 * precedenza avevamo un valore reale è più probabile un glitch/risposta
 * parziale della fonte che una vera rimozione del dato lato TCGdex — non
 * vale la pena rischiare di cancellare un dato buono per inseguire un
 * ipotetico "TCGdex l'ha tolto davvero". Se in futuro serve davvero poter
 * *azzerare* un campo perché la fonte lo ha rimosso in modo verificato, va
 * fatto con un percorso esplicito e loggato separatamente, non silenziosamente
 * dentro il merge automatico.
 *
 * @param {{rarity?: string, illustrator?: string, variants?: object}} fullCard
 * @returns {{rarity: string|null, illustrator: string|null, print_variant: string|null, _printVariantInfo: object}}
 */
export function buildIncomingFromDetail(fullCard) {
  const pv = resolvePrintVariant(fullCard?.variants)
  return {
    rarity: fullCard?.rarity ?? null,
    illustrator: fullCard?.illustrator ?? null,
    print_variant: pv.value,
    // Non un managed field, non finisce nel merge/upsert: solo per il report
    // (mostrare "ambiguous: normal+reverse" come warning senza perdere il
    // dettaglio che ha prodotto il gap).
    _printVariantInfo: pv,
  }
}

/**
 * Decide se una carta già presente in DB ha bisogno del fetch "detail"
 * (`GET /v2/{lang}/cards/{id}`, Card completo) invece di limitarsi al
 * CardBrief già ottenuto dalla discovery (`GET /v2/{lang}/sets/{id}`).
 *
 * Regole (requisito 2):
 *   - carta nuova (nessuna riga esistente)              -> sempre true
 *   - `forceDetail` esplicito (backfill una tantum)      -> sempre true
 *   - metadata "solo da detail" mancanti (rarity/illustrator null) -> true
 *   - riga stale secondo `staleDays` (se fornito)        -> true
 *   - altrimenti                                          -> false (non ri-scaricare
 *     una carta già completa "perché sì": requisito 2, ultima riga)
 *
 * NOTA (gap dichiarato): `print_variant` non è usato come segnale di
 * incompletezza qui — vedi commento in resolvePrintVariant sul perché
 * (potrebbe restare null per sempre per carte con finish multipli, senza che
 * questo significhi "mai stato scaricato").
 *
 * @param {object|null|undefined} existingRow
 * @param {{forceDetail?: boolean, staleDays?: number|null, now?: Date}} opts
 * @returns {boolean}
 */
export function needsDetailFetch(existingRow, opts = {}) {
  const { forceDetail = false, staleDays = null, now = new Date() } = opts
  if (!existingRow) return true
  if (forceDetail) return true
  if (isIncompleteRow(existingRow)) return true
  if (staleDays != null && existingRow.updated_at) {
    const updated = new Date(existingRow.updated_at)
    if (!Number.isNaN(updated.getTime())) {
      const ageDays = (now.getTime() - updated.getTime()) / 86400000
      if (ageDays > staleDays) return true
    }
  }
  return false
}

/**
 * Costruisce l'entry di report per un detail fetch fallito (requisito 8 —
 * "BLOCKED DETAIL FETCH"). Estratta come funzione pura separata (prima era
 * costruita a mano inline in `sync-cards.js`) per due motivi: evitare che la
 * forma dei campi diverga da quella di `buildDiffReportEntry`, e renderla
 * testabile senza dover simulare un intero orchestratore I/O.
 *
 * Nessun merge, nessun campo dalla carta parzialmente fetchata: `changes` è
 * sempre `[]` e `classification` è sempre `'BLOCKED'` — la riga esistente (se
 * c'è) non viene mai toccata da questa entry, il chiamante non deve mai
 * aggiungerla a `rowsToWrite`.
 *
 * @param {string} id
 * @param {{reason?: string, existed?: boolean, incomplete?: boolean, canonicalProtected?: boolean}} [opts]
 * @returns {object}
 */
export function buildBlockedEntry(id, opts = {}) {
  const { reason = 'DETAIL_FETCH_FAILED', existed = false, incomplete = false, canonicalProtected = false } = opts
  return {
    id,
    classification: 'BLOCKED',
    changes: [],
    warnings: [],
    detailFetched: false,
    reason,
    detailFetchRequired: true,
    detailFetchSkipped: false,
    variantPresent: false,
    variantAmbiguous: false,
    sourceConflict: false,
    canonicalProtected,
    nullProtected: false,
    existed,
    incomplete,
  }
}

/**
 * Determina, PRIMA del merge, se il campo protection del requisito 4
 * (null/undefined in arrivo non cancella un valore DB valido) sta
 * intervenendo davvero per questa carta — e su quali campi. Pura: non
 * modifica nulla, `mergeRow` resta l'unica funzione che decide il valore
 * finale; questa serve solo a rendere il comportamento visibile nel report
 * diagnostico (`nullProtected`/`null_protected` nel summary), che prima era
 * solo un effetto collaterale invisibile del merge.
 *
 * Nota deliberata: non distingue "campo assente perché non fetchato in questo
 * stage" da "campo tornato esplicitamente null da un detail fetch reale" —
 * stessa scelta conservativa già documentata su `mergeRow`/
 * `buildIncomingFromDetail`, qui resa solo osservabile invece che silenziosa.
 *
 * @param {object|null|undefined} existingRow
 * @param {object} incoming
 * @returns {{nullProtected: boolean, fields: string[]}}
 */
export function computeNullProtection(existingRow, incoming) {
  if (!existingRow) return { nullProtected: false, fields: [] }
  const fields = MANAGED_FIELDS.filter((field) => {
    const incomingVal = incoming ? incoming[field] : undefined
    const existingVal = existingRow[field] ?? null
    return (incomingVal === null || incomingVal === undefined) && existingVal !== null
  })
  return { nullProtected: fields.length > 0, fields }
}

/**
 * Compone in un'unica entry di report tutto quello che serve al --dry-run
 * (requisito 7): classificazione, diff campo-per-campo, ed eventuali warning
 * non distruttivi (oggi solo il gap `print_variant` ambiguo, ma pensato per
 * essere esteso — es. in futuro un fetch detail fallito può essere aggiunto
 * dal chiamante appendendo a `warnings`).
 *
 * Non fa fetch, non scrive nulla: prende in input ciò che l'orchestratore ha
 * già calcolato (riga esistente, riga unita, eventuale info variant) e
 * produce solo la forma del report.
 *
 * Oltre ai campi storici (id/classification/changes/warnings/detailFetched),
 * espone da questo task in poi (requisito 2 — "DRY-RUN SAFETY + REPORT
 * HARDENING") un set di flag booleani/aggregabili, non solo stringhe di
 * warning libere:
 *   - detailFetchRequired / detailFetchSkipped: mutuamente esclusivi, riflette
 *     la decisione già presa da `needsDetailFetch` per questa carta.
 *   - variantPresent / variantAmbiguous: derivati da `printVariantInfo`
 *     (vedi `resolvePrintVariant`) — `variantAmbiguous` è lo stesso segnale
 *     già usato per il warning testuale, ora anche come booleano aggregabile.
 *   - sourceConflict: SEMPRE `false` in questo task. Nessuna seconda fonte
 *     (pokemontcg.io o altro) è collegata alla pipeline — mettere qui
 *     qualunque altro valore sarebbe inventato. Il campo esiste già nella
 *     forma del report per non dover cambiare ancora la struttura quando una
 *     seconda fonte verrà davvero wired.
 *   - canonicalProtected: true se la riga esistente aveva un
 *     `canonical_card_id` non nullo (letto SOLO a scopo diagnostico da
 *     `processSupabaseReadResult`, mai propagato al merge/upsert).
 *   - nullProtected: true se `computeNullProtection` ha rilevato almeno un
 *     campo per cui un valore DB valido non è stato sovrascritto da un
 *     incoming null/undefined.
 *   - existed / incomplete: utili al summary aggregato (`existing_cards`,
 *     `incomplete_cards`) senza dover ricalcolare `existingRow` a valle.
 *
 * @param {string} id
 * @param {object|null|undefined} existingRow
 * @param {object} mergedRow
 * @param {{printVariantInfo?: object, detailFetched?: boolean, detailFetchRequired?: boolean, canonicalProtected?: boolean, nullProtected?: boolean, existed?: boolean, incomplete?: boolean}} [extra]
 * @returns {object}
 */
export function buildDiffReportEntry(id, existingRow, mergedRow, extra = {}) {
  const { classification, changes } = classifyRow(existingRow, mergedRow)
  const warnings = []
  const pv = extra.printVariantInfo
  const variantPresent = Boolean(pv?.present)
  const variantAmbiguous = Boolean(pv?.ambiguous)
  if (variantAmbiguous) {
    warnings.push(`PRINT_VARIANT_AMBIGUOUS_MULTI_FINISH: fonte riporta più finish veri (${pv.availableFinishes.join('+')}) — schema attuale (una riga per carta) non può rappresentarli entrambi, print_variant lasciato invariato/null per questa carta. Vedi gap documentato in resolvePrintVariant.`)
  }
  const detailFetchRequired = Boolean(extra.detailFetchRequired)
  return {
    id,
    classification,
    changes,
    warnings,
    detailFetched: Boolean(extra.detailFetched),
    detailFetchRequired,
    detailFetchSkipped: !detailFetchRequired,
    variantPresent,
    variantAmbiguous,
    sourceConflict: false, // mai inventato: nessuna seconda fonte collegata in questo task
    canonicalProtected: Boolean(extra.canonicalProtected),
    nullProtected: Boolean(extra.nullProtected),
    existed: Boolean(extra.existed),
    incomplete: Boolean(extra.incomplete),
  }
}
