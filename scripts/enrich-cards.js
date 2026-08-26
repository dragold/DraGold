/**
* DraGold - Card Enrichment Script (Fase 1 Knowledge Graph)
* Arricchisce gradualmente le carte Pokemon esistenti con dati gia' disponibili
* in TCGdex ma non salvati dal sync principale: illustrator, evolveFrom, dexId/hp/types/stage,
* e (da questo fix) supertype (da TCGdex `category`, vedi FIX SUPERTYPE sotto).
* Una chiamata per carta (endpoint dettaglio TCGdex) -> batch piccoli apposta per non
* sforare rate limit/timeout Action.
*
* FIX CODA BLOCCATA (bug verificato in audit 2026-08-19 — vedi CHARACTER_ENTITY_AUDIT):
* prima di questo fix, l'eleggibilita' era `illustrator IS NULL` e la riga veniva
* ri-scritta con `illustrator: detail.illustrator || null` — se TCGdex non restituiva
* un illustrator per quella carta (caso reale e frequente, non un errore), il campo
* restava null dopo l'update e la riga tornava eleggibile al giro successivo. Poiche'
* il run reale non usa un cursore (`fetchPage` senza `afterId`), la query
* `ORDER BY id ASC LIMIT pageSize` senza offset ripescava sempre le stesse righe in
* testa alla coda (idenficamente riprodotto: le carte del set `2011bw`, tra le prime in
* ordine lessicografico di `id`, risultavano ancora prive di `illustrator`/`metadata.dexId`
* dopo mesi di run programmati) — la coda non avanzava mai oltre quel punto, motivo
* verificato della copertura `dexId` bassissima (2,7% delle righe `tcgdex` Pokemon).
*
* Fix: l'eleggibilita' ora usa un marcatore scritto SEMPRE quando il detail fetch va a
* buon fine (indipendentemente da cosa contiene la risposta) — `metadata._enrichedAt`.
* Una riga esce dalla coda una volta tentata con successo (risposta HTTP ok), non solo
* quando il campo desiderato risulta popolato. Un fetch fallito (rete/timeout, HTTP non
* ok) NON scrive il marcatore: quella riga resta eleggibile e viene ritentata al giro
* successivo, comportamento invariato per i fallimenti transitori.
*
* FIX SUPERTYPE (bug verificato in audit 2026-08-19): alcune righe `tcg='pokemon'
* source='tcgdex'` hanno `supertype='Pokémon'` anche per carte Energia/Trainer — causa
* verificata: `supabase/functions/bulk-import-pokemon/index.ts` scriveva
* `supertype: 'Pokémon'` come costante fissa per OGNI riga importata, mai derivata dal
* dato reale (quella funzione non e' schedulata in nessun workflow GitHub Actions,
* quindi non e' piu' una sorgente attiva del bug, ma le righe che ha gia' scritto in
* passato restano sbagliate finche' qualcosa non le corregge). Il campo TCGdex
* `category` ("Pokemon" | "Trainer" | "Energy", verificato via documentazione ufficiale
* tcgdex.dev/reference/card) e' presente nella risposta Card completa che questo script
* gia' scarica per ogni riga — non richiede una nuova fonte esterna. Da questo fix,
* `enrichRow` corregge `supertype` con `detail.category` quando presente.
*
* Priorita' (CLAUDE.md §1): EN va esaurito completamente prima di JA, JA prima delle
* altre lingue. Ogni lingua prioritaria e' una fase a se'; dentro ogni fase si pagina
* con una "coda autoconsumante" basata sul marcatore `metadata._enrichedAt` (vedi FIX
* CODA BLOCCATA sopra), ordinata per id, senza usare offset/range -- il filtro si
* restringe da solo man mano che le righe vengono marcate, quindi un offset numerico
* salterebbe righe (le posizioni slittano ad ogni pagina scritta).
*
* Usage: node scripts/enrich-cards.js [--limit=500] [--lang=en,ja,it,fr,de,es,pt,id]
*   [--page-size=500] [--time-budget-min=25] [--dry-run]
*   --limit: numero massimo di carte processate in totale in questo run (tutte le fasi).
*   --page-size: righe per pagina Supabase (max 1000, cap PostgREST db.max_rows).
*   --time-budget-min: minuti massimi di esecuzione prima di fermarsi in modo pulito
*     (deve restare sotto il timeout-minutes del job GitHub Actions).
*   --dry-run: valida SOLO la logica di fasi/paginazione contro Supabase (sola lettura,
*     stessa query — marcatore metadata._enrichedAt assente — + stesso ordinamento). Non chiama TCGdex, non
*     scrive mai su Supabase. Utile per verificare EN->JA->resto senza spendere quota
*     API reale su un catalogo grande. Vedi runDryRun() piu' sotto.
* SUPABASE_URL e SUPABASE_SERVICE_KEY devono essere in env.
*/

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti')
process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TCGDEX_BASE = 'https://api.tcgdex.net/v2'
const DELAY_MS = 150
const POSTGREST_MAX_ROWS = 1000 // cap server-side (db.max_rows) osservato su questo progetto

const args = process.argv.slice(2)
const argVal = (name, def) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? def

const LIMIT = parseInt(argVal('limit', '500'), 10)
const LANG_FILTER = argVal('lang', 'en,ja,it,fr,de,es,pt,id').split(',')
const PAGE_SIZE = Math.min(parseInt(argVal('page-size', '500'), 10), POSTGREST_MAX_ROWS)
const TIME_BUDGET_MIN = parseFloat(argVal('time-budget-min', '25'))
const TIME_BUDGET_MS = TIME_BUDGET_MIN * 60 * 1000
const START_TIME = Date.now()
const DRY_RUN = args.includes('--dry-run')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const timeLeftMs = () => TIME_BUDGET_MS - (Date.now() - START_TIME)

async function safeFetch(url, timeout = 15000) {
try {
const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
if (!r.ok) return null
return r.json()
} catch { return null }
}

// ENRICHMENT STATUS (requisito task "Catalog Sync + Enrichment Fix"): vocabolario
// minimo richiesto SUCCESS/PARTIAL/RETRYABLE_ERROR/PERMANENT_ERROR/DATA_CONFLICT.
// Nessuna colonna nuova: riusa il pattern gia' in uso in questo script
// (`metadata._enrichedAt`), estendendolo con un oggetto `metadata._enrich`
// strutturato. DATA_CONFLICT e' definito qui per completare il vocabolario ma
// non e' mai prodotto da QUESTO script: un update per id su un singolo campo
// dettaglio TCGdex non ha ambiguita' di matching da segnalare (quella
// competenza e' del livello di canonical matching, fuori dallo scope di un
// enrichment per id gia' noto) -- lasciato riservato per non inventare un
// caso che non si verifica qui.
const ENRICH_STATUS = {
SUCCESS: 'SUCCESS',
PARTIAL: 'PARTIAL',
RETRYABLE_ERROR: 'RETRYABLE_ERROR',
PERMANENT_ERROR: 'PERMANENT_ERROR',
DATA_CONFLICT: 'DATA_CONFLICT', // riservato, vedi commento sopra
}
// Un fetch 404 reale (risorsa nota assente su TCGdex per questo set/card_number)
// dopo piu' tentativi non ha motivo di essere ritentato all'infinito: lo
// distinguiamo da un errore di rete/timeout (transitorio, va ritentato). Prima
// di questo fix `safeFetch` collassava entrambi i casi in `null`, indistinguibili.
async function fetchDetail(url, timeout = 15000) {
try {
const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
if (r.status === 404) return { ok: false, reason: 'not_found' }
if (!r.ok) return { ok: false, reason: 'http_error' }
return { ok: true, data: await r.json() }
} catch (e) {
return { ok: false, reason: e?.name === 'TimeoutError' ? 'timeout' : 'network' }
}
}
// Soglia tentativi 'not_found' prima di classificare PERMANENT_ERROR e smettere di
// ritentare (marcando _enrichedAt per farla uscire dalla coda): un singolo 404
// puo' essere propagazione lato TCGdex non ancora completata, non necessariamente
// assenza reale -- 3 tentativi falliti in run distinti sono un segnale piu' solido.
const PERMANENT_ERROR_THRESHOLD = 3

// Priorita' prodotto (CLAUDE.md §1): EN e JA vanno drenati prima delle altre lingue,
// EN prima di JA. Ogni lingua qui elencata diventa una fase separata ed esclusiva.
const PRIORITY_LANGS = ['en', 'ja']

// Una pagina della coda autoconsumante: stessa query, nessun offset. Le righe gia'
// tentate escono da sole dal risultato (metadata._enrichedAt non e' piu' assente),
// quindi ripetere la query e' sufficiente per ottenere "la pagina successiva".
//
// afterId (opzionale) e' usato SOLO dal dry-run: essendo sola lettura, il dry-run non
// scrive mai, quindi il filtro su metadata._enrichedAt non si restringe da solo pagina
// dopo pagina come nel run reale. Per evitare di rileggere all'infinito le stesse righe (e
// senza usare .range/offset, vietato perche' e' proprio il problema che vogliamo
// evitare) si ancora la pagina successiva all'ultimo id gia' letto con .gt('id', afterId)
// -- e' un cursore per chiave stabile, non una posizione numerica: non soffre dello
// shift che ha l'offset quando le righe sottostanti cambiano. Il run reale non passa
// mai afterId, quindi il suo comportamento e' identico a prima.
async function fetchPage(langs, pageSize, afterId = null) {
if (!langs.length || pageSize <= 0) return []
// FIX CODA BLOCCATA: eleggibilita' basata sul marcatore `metadata._enrichedAt`
// (assente = mai tentata con successo), non piu' su `illustrator IS NULL`. Un
// illustrator/dexId genuinamente assente in fonte non deve piu' bloccare la coda
// per sempre — vedi commento in testa al file. Solo source='tcgdex': questo script
// scarica dati da TCGdex per id (`set_id`/`card_number`), che per le righe
// source='ptcg' (pokemontcg.io) vive in uno spazio di identificatori diverso e
// incompatibile — includerle qui rischierebbe di interrogare TCGdex con un
// set_id/card_number che non gli appartiene. Non era filtrato esplicitamente prima
// di questo fix: corretto qui, stessa correzione, stesso motivo (bug adiacente
// scoperto durante la stessa verifica, non una nuova funzionalita').
let query = supabase
.from('cards')
.select('id, set_id, card_number, lang, metadata, supertype')
.eq('tcg', 'pokemon')
.eq('source', 'tcgdex')
.is('metadata->>_enrichedAt', null)
.not('set_id', 'is', null)
.not('card_number', 'is', null)
.in('lang', langs)
if (afterId) query = query.gt('id', afterId)
const { data, error } = await query
.order('id', { ascending: true })
.limit(pageSize)
if (error) { console.error('select error:', error.message); process.exit(1) }
return data || []
}

// Valori noti del campo TCGdex `category` (https://tcgdex.dev/reference/card,
// verificato in audit 2026-08-19). Solo questi tre vengono scritti in `supertype`:
// un valore inatteso/non documentato NON viene inventato, la riga resta con il
// supertype esistente (stesso principio conservativo gia' in uso nel resto dello
// script per rarity/illustrator).
const KNOWN_CATEGORIES = new Set(['Pokemon', 'Trainer', 'Energy'])
// TCGdex usa "Pokemon" (senza accento) per `category`; `cards.supertype` in
// produzione usa storicamente "Pokémon" (con accento, coerente con pokemontcg.io/
// sync-pokemon-ptcg.js) — mappato esplicitamente per non introdurre due grafie
// diverse per lo stesso valore nello stesso campo.
function mapCategoryToSupertype(category) {
  if (category === 'Pokemon') return 'Pokémon'
  if (KNOWN_CATEGORIES.has(category)) return category
  return null
}

// Fasi esclusive e ordinate: EN da sola, poi JA da sola, poi il resto delle lingue
// richieste insieme (come gruppo unico). Condivisa da run reale e dry-run, cosi'
// entrambi seguono esattamente la stessa priorita'.
function buildPhases(langFilter) {
const priorityPhases = PRIORITY_LANGS.filter(l => langFilter.includes(l)).map(l => [l])
const restPhase = langFilter.filter(l => !PRIORITY_LANGS.includes(l))
return restPhase.length ? [...priorityPhases, restPhase] : priorityPhases
}

async function enrichRow(row) {
await sleep(DELAY_MS)
<<<<<<< HEAD
const detail = await safeFetch(`${TCGDEX_BASE}/${row.lang}/sets/${row.set_id}/${row.card_number}`)
// Fetch fallito (rete/timeout/HTTP non-ok): NON scriviamo il marcatore
// `_enrichedAt`, la riga resta eleggibile e viene ritentata a un run successivo.
// Comportamento invariato rispetto a prima del fix — solo il caso "risposta
// ricevuta ma campo assente" (sotto) e' cambiato.
if (!detail) return 'notFound'
=======
const fetchResult = await fetchDetail(`${TCGDEX_BASE}/${row.lang}/sets/${row.set_id}/${row.card_number}`)

const prevEnrich = (row.metadata && row.metadata._enrich) || null
const prevAttempts = (prevEnrich && prevEnrich.attempts) || 0

if (!fetchResult.ok) {
// RETRYABLE_ERROR (rete/timeout/HTTP non-404): NON scriviamo `_enrichedAt`, la
// riga resta eleggibile e viene ritentata a un run successivo -- comportamento
// invariato rispetto a prima del fix. PERMANENT_ERROR (404 ripetuto) e' l'unica
// eccezione: dopo PERMANENT_ERROR_THRESHOLD tentativi smettiamo di ritentare
// (marcando _enrichedAt) per non interrogare per sempre una risorsa nota assente.
const attempts = prevAttempts + 1
const isPermanent = fetchResult.reason === 'not_found' && attempts >= PERMANENT_ERROR_THRESHOLD
const status = fetchResult.reason === 'not_found'
? (isPermanent ? ENRICH_STATUS.PERMANENT_ERROR : ENRICH_STATUS.RETRYABLE_ERROR)
: ENRICH_STATUS.RETRYABLE_ERROR
const metaPatch = {
...(row.metadata || {}),
_enrich: { status, attempts, lastAttempt: new Date().toISOString(), lastError: fetchResult.reason },
}
if (isPermanent) metaPatch._enrichedAt = new Date().toISOString()
const { error: statusErr } = await supabase.from('cards').update({ metadata: metaPatch }).eq('id', row.id)
if (statusErr) console.warn(`  status update error ${row.id}:`, statusErr.message)
return isPermanent ? 'permanentError' : 'notFound'
}
const detail = fetchResult.data
>>>>>>> feature/google-auth-profile-gdpr

const patch = {
illustrator: detail.illustrator || null,
evolves_from: detail.evolveFrom || null,
}
if (detail.rarity) patch.rarity = detail.rarity

// FIX SUPERTYPE: `category` e' un campo affidabile del Card object TCGdex
// (Pokemon/Trainer/Energy). Scritto solo quando il valore e' uno dei tre noti —
// vedi mapCategoryToSupertype. Corregge sia le righe mai classificate
// (supertype null) sia quelle scritte in passato da bulk-import-pokemon con la
// costante fissa 'Pokémon' indipendentemente dal vero tipo di carta.
const mappedSupertype = mapCategoryToSupertype(detail.category)
if (mappedSupertype) patch.supertype = mappedSupertype

const extraMeta = {}
if (detail.dexId) extraMeta.dexId = detail.dexId
if (detail.hp) extraMeta.hp = detail.hp
if (detail.types) extraMeta.types = detail.types
if (detail.stage) extraMeta.stage = detail.stage
// Marcatore di avanzamento coda (FIX CODA BLOCCATA): scritto SEMPRE quando
// arriviamo qui, indipendentemente da quali campi sopra erano popolati in questa
// risposta — e' quello che garantisce che la riga esca dall'eleggibilita' anche
// quando TCGdex non ha illustrator/dexId/category per questa carta specifica.
extraMeta._enrichedAt = new Date().toISOString()
<<<<<<< HEAD
=======
// SUCCESS/PARTIAL: SUCCESS quando TCGdex ha restituito i campi opzionali chiave
// (illustrator o category, i due piu' usati a valle); PARTIAL quando la risposta
// e' arrivata ok ma senza nessuno dei due -- non e' un errore (puo' essere reale,
// vedi FIX CODA BLOCCATA sopra), ma va distinto da un arricchimento pieno nel
// report strutturato.
const hasCore = !!(detail.illustrator || detail.category)
extraMeta._enrich = {
status: hasCore ? ENRICH_STATUS.SUCCESS : ENRICH_STATUS.PARTIAL,
attempts: prevAttempts + 1,
lastAttempt: extraMeta._enrichedAt,
lastError: null,
}
>>>>>>> feature/google-auth-profile-gdpr
patch.metadata = { ...(row.metadata || {}), ...extraMeta }

const { error: upErr } = await supabase.from('cards').update(patch).eq('id', row.id)
if (upErr) {
console.warn(` update error ${row.id}:`, upErr.message)
// RETRYABLE_ERROR: lo scrivere e' fallito lato Supabase (infra transitoria),
// non un problema del dato TCGdex -- _enrichedAt non e' stato scritto quindi
// la riga resta comunque eleggibile al giro successivo, coerente col resto.
return 'error'
}
return hasCore ? 'updated' : 'partial'
}

async function run() {
console.log(`Enrich cards - start (limit=${LIMIT}, lang=${LANG_FILTER.join(',')}, page-size=${PAGE_SIZE}, time-budget-min=${TIME_BUDGET_MIN})`)

const phases = buildPhases(LANG_FILTER)

let totalProcessed = 0
let stopReason = 'exhausted' // 'exhausted' | 'limit' | 'time-budget'
const stats = {} // lang -> { processed, updated, notFound, error }

outer:
for (const phaseLangs of phases) {
while (true) {
if (totalProcessed >= LIMIT) { stopReason = 'limit'; break outer }
if (timeLeftMs() <= 0) { stopReason = 'time-budget'; break outer }

const pageSize = Math.min(PAGE_SIZE, LIMIT - totalProcessed)
const rows = await fetchPage(phaseLangs, pageSize)
if (!rows.length) break // fase esaurita (0 righe eleggibili rimaste) -> fase successiva

for (const row of rows) {
if (totalProcessed >= LIMIT) { stopReason = 'limit'; break outer }
if (timeLeftMs() <= 0) { stopReason = 'time-budget'; break outer }

const outcome = await enrichRow(row)
totalProcessed++
const s = (stats[row.lang] ??= { processed: 0, updated: 0, partial: 0, notFound: 0, permanentError: 0, error: 0 })
s.processed++
if (outcome === 'updated') s.updated++
else if (outcome === 'partial') s.partial++
else if (outcome === 'permanentError') s.permanentError++
else if (outcome === 'notFound') s.notFound++
else s.error++
}
}
}

if (totalProcessed === 0) { console.log('Nessuna carta da arricchire per questo batch/lang.'); return }

console.log(`Enrich cards - done (motivo stop: ${stopReason}). Totale processate: ${totalProcessed}`)
for (const [lang, s] of Object.entries(stats)) {
console.log(` ${lang}: processate ${s.processed}, aggiornate(SUCCESS) ${s.updated}, PARTIAL ${s.partial}, RETRYABLE_ERROR ${s.notFound}, PERMANENT_ERROR ${s.permanentError}, errori-scrittura ${s.error}`)
}
// Report strutturato (requisito task: sync/enrichment report in JSON, nessuna UI).
// Stampato su stdout come ultima riga JSON-parsabile: i job GitHub Actions possono
// raccoglierlo da log senza bisogno di un file/endpoint dedicato.
const report = {
kind: 'enrich-cards-report',
startedAt: new Date(START_TIME).toISOString(),
finishedAt: new Date().toISOString(),
stopReason,
totalProcessed,
byLang: stats,
}
console.log('ENRICH_REPORT_JSON=' + JSON.stringify(report))
}

// Dry-run: SOLA LETTURA. Nessuna chiamata a TCGDEX_BASE, nessun enrichRow, nessun
// update/insert/delete su Supabase -- verifica solo che fasi e paginazione producano
// davvero EN esaurito -> JA esaurito -> resto, con la stessa query/ordinamento del run
// reale (differisce solo per il cursore afterId, vedi commento su fetchPage).
async function runDryRun() {
console.log(`Enrich cards - DRY RUN (sola lettura, nessuna chiamata TCGdex, nessuna scrittura Supabase) (limit=${LIMIT}, lang=${LANG_FILTER.join(',')}, page-size=${PAGE_SIZE})`)

const phases = buildPhases(LANG_FILTER)

let totalRead = 0
let stopReason = 'exhausted' // 'exhausted' | 'limit' | 'time-budget'
const stats = {} // lang -> count righe lette

outer:
for (const phaseLangs of phases) {
const phaseLabel = phaseLangs.join('+')
let cursor = null
let pageNum = 0

while (true) {
if (totalRead >= LIMIT) { stopReason = 'limit'; break outer }
if (timeLeftMs() <= 0) { stopReason = 'time-budget'; break outer }

const pageSize = Math.min(PAGE_SIZE, LIMIT - totalRead)
const rows = await fetchPage(phaseLangs, pageSize, cursor)
pageNum++

if (!rows.length) {
console.log(`[dry-run] fase "${phaseLabel}": esaurita dopo ${pageNum - 1} pagine (0 righe rimanenti) -> passo alla fase successiva`)
break
}

console.log(`[dry-run] fase "${phaseLabel}" pagina ${pageNum}: ${rows.length} righe lette (id ${rows[0].id} .. ${rows[rows.length - 1].id})`)

for (const row of rows) {
totalRead++
stats[row.lang] = (stats[row.lang] || 0) + 1
}
cursor = rows[rows.length - 1].id
}
}

console.log(`Enrich cards - DRY RUN done (motivo stop: ${stopReason}). Totale righe lette: ${totalRead}`)
for (const [lang, count] of Object.entries(stats)) {
console.log(` ${lang}: ${count} righe lette`)
}
if (totalRead === 0) console.log('Nessuna carta eleggibile trovata per questo filtro/lang.')
}

;(DRY_RUN ? runDryRun() : run()).catch(err => { console.error('Errore critico:', err.message); process.exit(1) })
