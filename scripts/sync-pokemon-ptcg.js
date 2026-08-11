/**
 * DraGold — Sync Pokémon cards da PokemonTCG.io API v2
 *
 * Sorgente: https://api.pokemontcg.io/v2
 *   - sets:  GET /v2/sets?pageSize=250&orderBy=releaseDate
 *   - cards: GET /v2/cards?q=set.id:{id}&pageSize=250&page={n}
 *
 * ID format: "pokemon:ptcg:{card.id}"  (es. "pokemon:ptcg:sv1-1")
 * Coesiste con TCGdex ("pokemon:tcgdex:...") — nessun conflitto.
 *
 * Usage:
 *   node scripts/sync-pokemon-ptcg.js [--set=sv1]   ← test su 1 set
 *   node scripts/sync-pokemon-ptcg.js                ← tutti i set EN
 *
 * Env richiesti:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   PTCG_API_KEY          ← consigliato (1000 req/min), senza key = 30 req/min
 */

import { createClient } from '@supabase/supabase-js'

// ─── CONFIGURAZIONE ──────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY
const PTCG_API_KEY  = process.env.PTCG_API_KEY || '0e322dad-527b-4fc5-9899-9753710174f7'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Env mancanti: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const PTCG_BASE  = 'https://api.pokemontcg.io/v2'
const BATCH_SIZE = 500   // righe per upsert Supabase
const DELAY_MS   = 200   // ms tra chiamate API (con key: 1000 req/min → 60ms min; 200ms = sicuro)

const args   = process.argv.slice(2)
const argSet = args.find(a => a.startsWith('--set='))?.split('=')[1] || null

// ─── UTILS ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

const PTCG_HEADERS = {
  'X-Api-Key': PTCG_API_KEY,
  'Accept': 'application/json',
}

async function safeFetch(url, timeoutMs = 30000) {
  try {
    const res = await fetch(url, {
      headers: PTCG_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} → ${url}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn(`  ⚠️  Fetch error (${err.message}) → ${url}`)
    return null
  }
}

async function upsertBatch(rows) {
  if (!rows.length) return
  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) console.warn(`  ⚠️  Upsert error: ${error.message}`)
}

// ─── MAPPATURA ───────────────────────────────────────────────────────────────

function mapCard(c) {
  return {
    id:           `pokemon:ptcg:${c.id}`,
    tcg:          'pokemon',
    source:       'ptcg',
    source_id:    c.id,
    lang:         'en',
    name:         c.name || '',
    name_en:      c.name || '',
    set_id:       c.set?.id   || null,
    set_name:     c.set?.name || null,
    card_number:  c.number != null ? String(c.number) : null,
    rarity:       c.rarity    || null,
    supertype:    c.supertype || null,
    illustrator:  c.artist    || null,
    image_url:    c.images?.large || c.images?.small || null,
    image_url_hi: c.images?.large || null,
    updated_at:   new Date().toISOString(),
  }
}

// ─── FETCH SETS ──────────────────────────────────────────────────────────────

async function fetchAllSets() {
  const json = await safeFetch(`${PTCG_BASE}/sets?pageSize=250&orderBy=releaseDate`, 30000)
  return json?.data || []
}

// ─── SYNC SET ────────────────────────────────────────────────────────────────

async function syncSet(setId, setName) {
  let page      = 1
  let total     = 0
  let imported  = 0

  do {
    await sleep(DELAY_MS)
    const url  = `${PTCG_BASE}/cards?q=set.id:${setId}&pageSize=250&page=${page}`
    const json = await safeFetch(url)

    if (!json?.data) {
      console.warn(`  ⚠️  ${setId} pag.${page}: risposta vuota`)
      break
    }

    const rows = json.data
      .filter(c => c.id && c.name)
      .map(mapCard)

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }

    imported += rows.length
    total     = json.totalCount || json.count || imported
    page++
  } while (imported < total)

  console.log(`  ✅  ${setId} (${setName}): ${imported} carte`)
  return imported
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🃏  DraGold — Sync Pokémon da PokemonTCG.io API v2')
  console.log(`   Set: ${argSet || 'tutti'} | Lingua: en | Key: ${PTCG_API_KEY ? '✓' : '✗ (limit 30/min)'}`)

  console.log('\n📋  Fetching lista set...')
  const allSets = await fetchAllSets()
  if (!allSets.length) {
    console.error('❌  Impossibile scaricare la lista set dall\'API')
    process.exit(1)
  }
  console.log(`   ${allSets.length} set trovati`)

  const setsToProcess = argSet
    ? allSets.filter(s => s.id === argSet)
    : allSets

  if (argSet && setsToProcess.length === 0) {
    console.error(`❌  Set "${argSet}" non trovato`)
    console.log('   Esempi:', allSets.slice(0, 10).map(s => s.id).join(', '), '...')
    process.exit(1)
  }

  let totalImported = 0
  let totalFailed   = 0
  const start = Date.now()

  for (let i = 0; i < setsToProcess.length; i++) {
    const { id: setId, name: setName } = setsToProcess[i]
    try {
      const count = await syncSet(setId, setName)
      totalImported += count
    } catch (err) {
      console.warn(`  ❌  Set ${setId} fallito: ${err.message}`)
      totalFailed++
    }

    if (!argSet && (i + 1) % 10 === 0) {
      const pct = (((i + 1) / setsToProcess.length) * 100).toFixed(0)
      console.log(`\n   Progresso: ${i + 1}/${setsToProcess.length} set (${pct}%) — ${totalImported} carte\n`)
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log('\n' + '─'.repeat(50))
  console.log(`✅  Sync completato in ${elapsed}s`)
  console.log(`   Carte importate: ${totalImported}`)
  console.log(`   Set falliti:     ${totalFailed}`)
  if (argSet) {
    console.log('\n💡  Per importare tutti i set: node scripts/sync-pokemon-ptcg.js')
  }
}

main().catch(err => {
  console.error('❌  Errore critico:', err.message)
  process.exit(1)
})
