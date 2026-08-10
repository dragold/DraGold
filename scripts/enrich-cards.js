/**
* DraGold - Card Enrichment Script (Fase 1 Knowledge Graph)
* Arricchisce gradualmente le carte Pokemon esistenti con dati gia' disponibili
* in TCGdex ma non salvati dal sync principale: illustrator, evolveFrom, dexId/hp/types/stage.
* Una chiamata per carta (endpoint dettaglio TCGdex) -> batch piccoli apposta per non
* sforare rate limit/timeout Action. Idempotente: prende solo le righe con illustrator
* ancora nullo, quindi puo' girare piu' volte al giorno finche' non copre tutto il catalogo.
*
* Priorita' (CLAUDE.md §1): EN va esaurito completamente prima di JA, JA prima delle
* altre lingue. Ogni lingua prioritaria e' una fase a se'; dentro ogni fase si pagina
* con una "coda autoconsumante": si ripete la stessa query (illustrator IS NULL, stessa
* lingua, ordinata per id) finche' non restituisce piu' righe, senza usare offset/range
* -- il filtro si restringe da solo man mano che le righe vengono aggiornate, quindi un
* offset numerico salterebbe righe (le posizioni slittano ad ogni pagina scritta).
*
* Usage: node scripts/enrich-cards.js [--limit=500] [--lang=en,ja,it,fr,de,es,pt,id]
*   [--page-size=500] [--time-budget-min=25] [--dry-run]
*   --limit: numero massimo di carte processate in totale in questo run (tutte le fasi).
*   --page-size: righe per pagina Supabase (max 1000, cap PostgREST db.max_rows).
*   --time-budget-min: minuti massimi di esecuzione prima di fermarsi in modo pulito
*     (deve restare sotto il timeout-minutes del job GitHub Actions).
*   --dry-run: valida SOLO la logica di fasi/paginazione contro Supabase (sola lettura,
*     stessa query illustrator IS NULL + stesso ordinamento). Non chiama TCGdex, non
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

// Priorita' prodotto (CLAUDE.md §1): EN e JA vanno drenati prima delle altre lingue,
// EN prima di JA. Ogni lingua qui elencata diventa una fase separata ed esclusiva.
const PRIORITY_LANGS = ['en', 'ja']

// Una pagina della coda autoconsumante: stessa query, nessun offset. Le righe gia'
// arricchite escono da sole dal risultato (illustrator non e' piu' null), quindi
// ripetere la query e' sufficiente per ottenere "la pagina successiva".
//
// afterId (opzionale) e' usato SOLO dal dry-run: essendo sola lettura, il dry-run non
// scrive mai, quindi il filtro illustrator IS NULL non si restringe da solo pagina dopo
// pagina come nel run reale. Per evitare di rileggere all'infinito le stesse righe (e
// senza usare .range/offset, vietato perche' e' proprio il problema che vogliamo
// evitare) si ancora la pagina successiva all'ultimo id gia' letto con .gt('id', afterId)
// -- e' un cursore per chiave stabile, non una posizione numerica: non soffre dello
// shift che ha l'offset quando le righe sottostanti cambiano. Il run reale non passa
// mai afterId, quindi il suo comportamento e' identico a prima.
async function fetchPage(langs, pageSize, afterId = null) {
if (!langs.length || pageSize <= 0) return []
let query = supabase
.from('cards')
.select('id, set_id, card_number, lang, metadata')
.eq('tcg', 'pokemon')
.is('illustrator', null)
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
const detail = await safeFetch(`${TCGDEX_BASE}/${row.lang}/sets/${row.set_id}/${row.card_number}`)
if (!detail) return 'notFound'

const patch = {
illustrator: detail.illustrator || null,
evolves_from: detail.evolveFrom || null,
}
if (detail.rarity) patch.rarity = detail.rarity

const extraMeta = {}
if (detail.dexId) extraMeta.dexId = detail.dexId
if (detail.hp) extraMeta.hp = detail.hp
if (detail.types) extraMeta.types = detail.types
if (detail.stage) extraMeta.stage = detail.stage
if (Object.keys(extraMeta).length) {
patch.metadata = { ...(row.metadata || {}), ...extraMeta }
}

const { error: upErr } = await supabase.from('cards').update(patch).eq('id', row.id)
if (upErr) { console.warn(` update error ${row.id}:`, upErr.message); return 'error' }
return 'updated'
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
const s = (stats[row.lang] ??= { processed: 0, updated: 0, notFound: 0, error: 0 })
s.processed++
if (outcome === 'updated') s.updated++
else if (outcome === 'notFound') s.notFound++
else s.error++
}
}
}

if (totalProcessed === 0) { console.log('Nessuna carta da arricchire per questo batch/lang.'); return }

console.log(`Enrich cards - done (motivo stop: ${stopReason}). Totale processate: ${totalProcessed}`)
for (const [lang, s] of Object.entries(stats)) {
console.log(` ${lang}: processate ${s.processed}, aggiornate ${s.updated}, non trovate ${s.notFound}, errori ${s.error}`)
}
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
