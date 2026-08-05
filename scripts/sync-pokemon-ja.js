/**
 * DraGold - Sync Pokemon JP (TCGdex /v2/ja)
 * Lang: 'ja' | Skip set gia completi | --recent usa pattern era (sv*=2023+)
 * Usage:
 *   node scripts/sync-pokemon-ja.js              tutti i set JA
 *   node scripts/sync-pokemon-ja.js --recent     solo SV era (2023+)
 *   node scripts/sync-pokemon-ja.js --set=sv10   set specifico
 *   node scripts/sync-pokemon-ja.js --force      riscrive anche set completi
 *   node scripts/sync-pokemon-ja.js --dry-run    solo fetch, nessuna scrittura
 */

import { createClient } from '@supabase/supabase-js'
import { resolveCardImage } from './lib/image-resolver.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TCGDEX_BASE   = 'https://api.tcgdex.net/v2'
const BATCH_SIZE    = 100
const DELAY_MS      = 250
const FETCH_TIMEOUT = 20000
const RECENT_CUTOFF = '2023-01-01'

const args    = process.argv.slice(2)
const argSet  = args.find(a => a.startsWith('--set='))?.split('=')[1]
const DRY_RUN = args.includes('--dry-run')
const RECENT  = args.includes('--recent')
const FORCE   = args.includes('--force')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log   = msg => process.stdout.write(msg + '\n')
const tick  = ()  => process.stdout.write('.')

async function safeFetch(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'User-Agent': 'DraGold-Sync/1.0', 'Accept': 'application/json' },
    })
    if (!res.ok) { log(`  HTTP ${res.status} -> ${url}`); return null }
    return res.json()
  } catch (err) {
    log(`  Fetch error (${err.message}) -> ${url}`)
    return null
  }
}

async function upsertBatch(rows) {
  if (!rows.length || DRY_RUN) return
  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) log(`  Upsert error: ${error.message}`)
}

async function countExisting(setId) {
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('tcg', 'pokemon').eq('lang', 'ja').eq('set_id', setId)
  return count || 0
}

function buildImageUrl(card, setId) {
  if (card.image) return `${card.image}/high.webp`
        return null // TCGdex non fornisce alcun asset per questa carta: nessun URL indovinato
}

/**
 * TCGdex non include releaseDate nella lista set (ne EN ne JA).
 * Usiamo prefissi ID per assegnare date approssimative per era.
 * sv* = Scarlet & Violet (2023+), swsh* = Sword & Shield (2020), etc.
 */
function guessReleaseDate(setId) {
  const id = setId.toLowerCase()
  if (id.startsWith('sv'))   return '2023-01-01'
  if (id.startsWith('swsh')) return '2020-01-01'
  if (id.startsWith('sm'))   return '2017-01-01'
  if (id.startsWith('xy'))   return '2014-01-01'
  if (id.startsWith('bw'))   return '2011-01-01'
  if (id.startsWith('dp'))   return '2007-01-01'
  if (id.startsWith('ex'))   return '2004-01-01'
  if (id.startsWith('neo'))  return '2000-01-01'
  if (id.startsWith('base')) return '1999-01-01'
  if (id.startsWith('pm'))   return '1996-01-01'
  return '1990-01-01'
}

function buildDateMap(sets) {
  const map = {}
  for (const s of sets) if (s.id) map[s.id] = guessReleaseDate(s.id)
  return map
}

async function syncPokemonJA() {
  log('\n[Pokemon JA] Avvio sync da TCGdex /v2/ja...')

  const rawSets = await safeFetch(`${TCGDEX_BASE}/ja/sets`)
  if (!Array.isArray(rawSets)) { log('  TCGdex JA /sets non disponibile - abort'); process.exit(1) }

  const seen = new Set()
  const allSets = rawSets.filter(s => s.id && !seen.has(s.id) && seen.add(s.id))
  log(`  ${allSets.length} set JA unici dalla TCGdex API`)

  const dateMap = buildDateMap(allSets)

  let toProcess = argSet
    ? allSets.filter(s => s.id.toLowerCase() === argSet.toLowerCase())
    : allSets

  if (RECENT && !argSet) {
    toProcess = toProcess.filter(s => (dateMap[s.id] || '') >= RECENT_CUTOFF)
    log(`  Filtro --recent: ${toProcess.length} set sv* (2023+)`)
  }

  toProcess.sort((a, b) => (dateMap[b.id] || '').localeCompare(dateMap[a.id] || ''))

  log(`  ${toProcess.length} set da processare (ordine: piu recenti prima)`)
  log(`  Dry-run: ${DRY_RUN ? 'SI' : 'no'} | Force: ${FORCE ? 'SI' : 'no'}`)
  log('')

  let totalInserted = 0, skipped = 0, failed = 0
  const failedSets = []

  for (const meta of toProcess) {
    const setId    = meta.id
    const setName  = meta.name || setId
    const dateStr  = dateMap[setId] || 'n/d'
    const expected = meta.cardCount?.total ?? meta.cardCount ?? 0

    if (!FORCE && !argSet) {
      const existing = await countExisting(setId)
      if (existing >= expected && expected > 0) { tick(); skipped++; continue }
    }

    await sleep(DELAY_MS)
    const setData = await safeFetch(`${TCGDEX_BASE}/ja/sets/${setId}`)

    if (!setData?.cards?.length) {
      log(`  ${setId} (${dateStr}): nessuna carta - skip`)
      failed++; failedSets.push(setId); continue
    }

    const setNameJP = setData.name || setName
    coonst rows = setData.cards
          .filter(c => c.localId && c.name)
          .map(c => ({
                    id:            `pokemon:tcgdex:${setId}-${c.localId}:ja`,
                    source:        'tcgdex',
                    source_id:     `${setId}-${c.localId}`,
                    name:          c.name,
                    set_id:        setId,
                    set_name:      setNameJP,
                    card_number:   String(c.localId),
                    rarity:        c.rarity  || null,
                    supertype:     c.category || null,
                    image_url:     null,
                    image_url_hi:  null,
                    lang:          'ja',
                    tcg:           'pokemon',
                    _rawCard:      c,
          }))

        for (const row of rows) {
                const resolved = await resolveCardImage(row._rawCard, 'ja')
                row.image_url = resolved.url
                row.image_url_hi = resolved.url
                delete row._rawCard
        }

    if (!rows.length) {
      log(`  ${setId}: nessuna carta valida`)
      failed++; failedSets.push(setId); continue
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) await upsertBatch(rows.slice(i, i + BATCH_SIZE))

    totalInserted += rows.length
    log(`  ${setId.padEnd(22)} ${setNameJP.padEnd(30)} (${dateStr})  ${rows.length} carte`)
  }

  log('')
  log('===============================================')
  log(`  Pokemon JA sync completato`)
  log(`  Carte inserite/aggiornate : ${totalInserted}`)
  log(`  Set saltati (gia completi) : ${skipped}`)
  log(`  Set falliti/vuoti          : ${failed}`)
  if (failedSets.length) log(`  Set con problemi: ${failedSets.join(', ')}`)
  if (DRY_RUN) log('  DRY-RUN - nessuna scrittura su DB')
  log('===============================================')
}

const t0 = Date.now()
log('===========================================')
log('  DraGold - Sync Pokemon JP (TCGdex JA)')
log('===========================================')
log(`  Avvio: ${new Date().toISOString()}`)
log(`  Set:   ${argSet || (RECENT ? 'sv* (2023+)' : 'tutti')}`)
log('')

try { await syncPokemonJA() }
catch (err) { console.error('Errore critico:', err.message); console.error(err.stack); process.exit(1) }

log(`  Completato in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
