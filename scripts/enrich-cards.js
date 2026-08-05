/**
* DraGold - Card Enrichment Script (Fase 1 Knowledge Graph)
* Arricchisce gradualmente le carte Pokemon esistenti con dati gia' disponibili
* in TCGdex ma non salvati dal sync principale: illustrator, evolveFrom, dexId/hp/types/stage.
* Una chiamata per carta (endpoint dettaglio TCGdex) -> batch piccoli apposta per non
* sforare rate limit/timeout Action. Idempotente: prende solo le righe con illustrator
* ancora nullo, quindi puo' girare piu' volte al giorno finche' non copre tutto il catalogo.
*
* Usage: node scripts/enrich-cards.js [--limit=500] [--lang=en,ja,it,fr,de,es,pt,id]
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

const args = process.argv.slice(2)
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '500', 10)
const LANG_FILTER = (args.find(a => a.startsWith('--lang='))?.split('=')[1] || 'en,ja,it,fr,de,es,pt,id').split(',')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function safeFetch(url, timeout = 15000) {
try {
const r = await fetch(url, { signal: AbortSignal.timeout(timeout) })
if (!r.ok) return null
return r.json()
} catch { return null }
}

async function run() {
console.log(`Enrich cards - start (limit=${LIMIT}, lang=${LANG_FILTER.join(',')})`)
const { data: rows, error } = await supabase
.from('cards')
.select('id, set_id, card_number, lang, metadata')
.eq('tcg', 'pokemon')
.is('illustrator', null)
.not('set_id', 'is', null)
.not('card_number', 'is', null)
.in('lang', LANG_FILTER)
.limit(LIMIT)

if (error) { console.error('select error:', error.message); process.exit(1) }
if (!rows?.length) { console.log('Nessuna carta da arricchire per questo batch/lang.'); return }
console.log(`${rows.length} carte da arricchire`)

let updated = 0, notFound = 0
for (const row of rows) {
await sleep(DELAY_MS)
const detail = await safeFetch(`${TCGDEX_BASE}/${row.lang}/sets/${row.set_id}/${row.card_number}`)
if (!detail) { notFound++; continue }

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
if (upErr) console.warn(` update error ${row.id}:`, upErr.message)
else updated++
}
console.log(`Enrich cards - done. Aggiornate ${updated}/${rows.length} (non trovate/errore: ${notFound})`)
}

run().catch(err => { console.error('Errore critico:', err.message); process.exit(1) })
