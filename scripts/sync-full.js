/**
 * DraGold â Full Card Sync v3
 *
 * Fonti:
 *   Pokemon EN  â TCGdex /v2/en   (gratuita, multilingua, stessa fonte della JA)
 *   Pokemon JA  â TCGdex /v2/ja   (gratuita, multilingua)
 *   One Piece EN â optcgapi.com   (4347+ carte EN, gratuita)
 *   One Piece JA â derivata dai dati EN + CDN immagini ufficiale hJP
 *                  (ignoreDuplicates=true: preserva nomi JA reali giÃ  in DB)
 *
 * Usage:
 *   node scripts/sync-full.js [--tcg pokemon,op] [--lang en,ja] [--set OP-05] [--dry-run]
 *
 * Env richiesti:
 *   SUPABASE_URL (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { ONEPIECE_MANAGED_FIELDS, mergeOnePieceRow } from './lib/onepiece-sync.js'
import { processSupabaseReadResult } from './lib/pokemon-sync.js'
import { runOnePieceSync } from './sync-onepiece.js'

async function fetchExistingOnePieceRows(supabaseClient, setId, lang) {
  const columns = ['id', ...ONEPIECE_MANAGED_FIELDS, 'updated_at', 'canonical_card_id'].join(',')
  const { data, error } = await supabaseClient
    .from('cards')
    .select(columns)
    .eq('tcg', 'onepiece').eq('set_id', setId).eq('lang', lang)
  return processSupabaseReadResult(data, error, { setId, lang })
}

// âââ Config DB âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL (o VITE_SUPABASE_URL) e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Report strutturato (requisito task): un contatore per funzione, stampato
// come JSON a fine run -- nessuna UI richiesta, solo log leggibile da CI.
const SYNC_STATS = {}

// âââ Costanti âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const BATCH_SIZE  = 100    // righe per upsert batch
const DELAY_MS    = 200    // ms tra richieste HTTP esterne (rate-limiting gentile)
const DELAY_JP    = 500    // ms tra pagine JP (piÃ¹ cauteloso col sito ufficiale)
const FETCH_TIMEOUT = 25000

// âââ Args CLI âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const args      = process.argv.slice(2)
const argTcg    = args.find(a => a.startsWith('--tcg='))?.split('=')[1]?.split(',')
const argLang   = args.find(a => a.startsWith('--lang='))?.split('=')[1]?.split(',')
const argSet    = args.find(a => a.startsWith('--set='))?.split('=')[1]
const DRY_RUN   = args.includes('--dry-run')

const TCG_FILTER  = argTcg  || ['pokemon', 'op']
const LANG_FILTER = argLang || ['en', 'ja']

// âââ Utilities ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const sleep = ms => new Promise(r => setTimeout(r, ms))

const log  = msg => process.stdout.write(msg + '\n')
const tick = ()  => process.stdout.write('.')

/**
 * Fetch sicuro con timeout e gestione errori.
 * Restituisce JSON (object/array) se Content-Type include "json", altrimenti testo.
 * Restituisce null in caso di errore o status non-2xx.
 */
async function safeFetch(url, opts = {}) {
  const headers = {
    'User-Agent':  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':      'application/json, text/html;q=0.9, */*;q=0.8',
    ...opts.headers,
  }
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(FETCH_TIMEOUT),
      headers,
      ...opts,
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    return ct.includes('json') ? res.json() : res.text()
  } catch {
    return null
  }
}

/**
 * Upsert batch su Supabase. Skip in dry-run mode.
 */
async function upsertBatch(rows) {
  if (!rows.length) return
  if (DRY_RUN) return  // dry-run: solo log, niente scritture
  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) console.warn(`  â  upsert error: ${error.message}`)
}
//âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// POKEMON EN  â  TCGdex /v2/en  (stessa fonte della JA, nessun rate limit)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function syncPokemonEN() {
  log('\n[Pokemon EN] TCGdex API...')
  const TCGDEX = 'https://api.tcgdex.net/v2'

  const sets = await safeFetch(`${TCGDEX}/en/sets`)
  if (!Array.isArray(sets)) { log('  â TCGdex EN non disponibile'); return }

  // Dedup
  const seen       = new Set()
  const uniqueSets = sets.filter(s => s.id && !seen.has(s.id) && seen.add(s.id))

  const toProcess = argSet
    ? uniqueSets.filter(s => s.id.toLowerCase() === argSet.toLowerCase())
    : uniqueSets

  log(`  ${toProcess.length} set EN da processare`)

  let inserted = 0, emptyCount = 0

  for (const meta of toProcess) {
    await sleep(DELAY_MS)
    const setData = await safeFetch(`${TCGDEX}/en/sets/${meta.id}`)

    if (!setData?.cards?.length) {
      emptyCount++
      tick()
      continue
    }

    const rows = setData.cards
      .filter(c => c.localId && c.name)
      .map(c => ({
        id:           `pokemon:tcgdex:${meta.id}-${c.localId}:en`,
        source:        'tcgdex',
        source_id:    `${meta.id}-${c.localId}`,
        name:         c.name,
        set_id:       meta.id,
        set_name:     setData.name || meta.name,
        card_number:  String(c.localId),
        rarity:       c.rarity || null,
        image_url:    c.image
          ? `${c.image}/high.webp`
          : `https://assets.tcgdex.net/en/${meta.id}/${c.localId}/high.webp`,
        image_url_hi: c.image ? `${c.image}/high.webp` : null,
        lang:         'en',
        tcg:          'pokemon',
      }))

    if (!rows.length) { emptyCount++; continue }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length
    tick()
  }

  log(`\n  â Pokemon EN: ${inserted} carte (${emptyCount} set vuoti/saltati)`)
  SYNC_STATS.pokemonEN = { cardsUpserted: inserted, emptySets: emptyCount }
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// POKEMON JA  â  TCGdex /v2/ja
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function syncPokemonJA() {
  log('\n[Pokemon JA] TCGdex API...')
  const TCGDEX = 'https://api.tcgdex.net/v2'

  const sets = await safeFetch(`${TCGDEX}/ja/sets`)
  if (!Array.isArray(sets)) { log('  â TCGdex JA non disponibile'); return }

  // Deduplicazione: la lista JA contiene entry duplicate per stesso id
  const seen       = new Set()
  const uniqueSets = sets.filter(s => s.id && !seen.has(s.id) && seen.add(s.id))

  const toProcess = argSet
    ? uniqueSets.filter(s => s.id.toLowerCase() === argSet.toLowerCase())
    : uniqueSets

  log(`  ${toProcess.length} set unici JA da processare`)

  let inserted = 0, emptyCount = 0

  for (const meta of toProcess) {
    await sleep(DELAY_MS)
    const setData = await safeFetch(`${TCGDEX}/ja/sets/${meta.id}`)

    if (!setData?.cards?.length) {
      emptyCount++
      tick()
      continue
    }

    const rows = setData.cards
      .filter(c => c.localId && c.name)
      .map(c => ({
        id:           `pokemon:tcgdex:${meta.id}-${c.localId}:ja`,
        source:        'tcgdex',
        source_id:    `${meta.id}-${c.localId}`,
        name:         c.name,
        set_id:       meta.id,
        set_name:     setData.name || meta.name,
        card_number:  String(c.localId),
        rarity:       c.rarity || null,
        // Immagine: usa URL diretto se disponibile, altrimenti CDN TCGdex
        image_url:    c.image
          ? `${c.image}/high.webp`
          : `https://assets.tcgdex.net/ja/${meta.id}/${c.localId}/high.webp`,
        image_url_hi: c.image ? `${c.image}/high.webp` : null,
        lang:         'ja',
        tcg:          'pokemon',
      }))

    if (!rows.length) { emptyCount++; continue }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length
    tick()
  }

  log(`\n  â Pokemon JA: ${inserted} carte (${emptyCount} set vuoti/saltati)`)
  SYNC_STATS.pokemonJA = { cardsUpserted: inserted, emptySets: emptyCount }
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// ONE PIECE EN  â  optcgapi.com
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function syncOnePieceEN() {
  // FASE 1 (2026-09): discovery One Piece SOURCE-DRIVEN via TCGCSV
  // (scripts/sync-onepiece.js). Nessuna lista hardcoded, nessuna dipendenza da
  // optcgapi.com (ferma a OP-12). --set esplicito -> quel set; altrimenti i
  // group con release negli ultimi 150 giorni (lo storico e' gia' in DB, i gap
  // piu' vecchi li gestisce catalog-freshness.yml).
  log('\n[One Piece EN] TCGCSV (source-driven, sync-onepiece.js)...')
  const opts = argSet
    ? { sets: [argSet] }
    : { since: new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10) }
  const r = await runOnePieceSync({ supabase, dryRun: DRY_RUN, log, ...opts })
  SYNC_STATS.onePieceEN = { groups: r.groupsProcessed, cardsUpserted: r.cardsUpserted, pricesUpserted: r.pricesUpserted }
  log(`  One Piece EN: ${r.cardsUpserted} carte, ${r.pricesUpserted} prezzi (${r.groupsProcessed} group)`)
  return
}

async function _deadSyncOnePieceEN_optcgapi() {
  log('\n[One Piece EN] optcgapi.com...')
  const OPTCG = 'https://optcgapi.com/api'

  // Set da provare: OP-01..OP-16, ST-01..ST-24, promo
  // L'API restituisce 404 per set inesistenti â skip automatico
  const allSets = [
    ...Array.from({ length: 25 }, (_, i) => `OP-${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 30 }, (_, i) => `ST-${String(i + 1).padStart(2, '0')}`),
          ...Array.from({ length: 5 }, (_, i) => `EB-${String(i + 1).padStart(2, '0')}`),
  ]

  const toProcess = argSet
    ? allSets.filter(s => s.toLowerCase() === argSet.toLowerCase())
    : allSets

  let inserted = 0, setsFound = 0

  for (const setId of toProcess) {
    await sleep(DELAY_MS)

    // L'API usa Django REST Framework: ?format=json forza risposta JSON
    const raw = await safeFetch(`${OPTCG}/sets/${setId}/?format=json`)
    if (!Array.isArray(raw) || !raw.length) continue  // 404 o set non esistente

    // FIX (audit + verifica in questo task): non deduplichiamo piu' per
  // card_set_id scartando le varianti Parallel (bug noto e documentato:
  // le Parallel sono stampe reali distinte, non duplicati). Ogni riga
  // dell'API (base + ogni _p1, _p2...) diventa una riga propria; le
  // Parallel sono taggate nel campo esistente print_variant (nessuna
  // colonna nuova) e ricevono un id distinto includendo card_image_id.
  // FIX set_id: prima veniva usato c.set_id (campo per-carta dell'API,
  // non verificato) invece del setId gia' noto e corretto del ciclo, che
  // e' esattamente il set appena richiesto a optcgapi. Stesso pattern gia'
  // corretto in syncOnePieceJA (sotto), qui allineato per coerenza.
    const rows = raw
      .filter(c => c.card_set_id)
      .map(c => {
        const isParallel = !!(c.card_image_id && /_p\d+$/.test(c.card_image_id))
        const cardId = isParallel ? `${c.card_set_id}:${c.card_image_id}` : c.card_set_id
        return {
          id:           `onepiece:optcg:${cardId}:en`,
          source:       'optcg',
          source_id:    cardId,
          name:         c.card_name,
          set_id:       setId.replace('-', '').toLowerCase(),
          set_name:     c.set_name,
          card_number:  c.card_set_id,
          rarity:       c.rarity || null,
          print_variant: isParallel ? 'parallel' : null,
          image_url:    c.card_image || null,
          image_url_hi: c.card_image || null,
          lang:         'en',
          tcg:          'onepiece',
        }
      })

    if (!rows.length) continue

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length
    setsFound++
    log(`  ${setId}: ${rows.length} carte`)
  }

  log(`  â One Piece EN: ${inserted} carte da ${setsFound} set`)
  SYNC_STATS.onePieceEN = { cardsUpserted: inserted, setsFound }
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// ONE PIECE JA  â  derivata da optcgapi (EN) + CDN immagini ufficiale JP
//
// Strategia:
//   - Il sito jp.onepiece-cardgame.com blocca i bot â non scrappare
//   - I card ID sono identici tra EN e JA (es. OP01-001)
//   - Le immagini JP sono accessibili direttamente dal CDN ufficiale
//   - ignoreDuplicates: true â le 1914+ carte esistenti con nomi JA reali
//     NON vengono sovrascritte; solo le carte mancanti vengono aggiunte
//     (con nome EN come placeholder finchÃ© non si trova fonte JA migliore)
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
async function syncOnePieceJA() {
  // FASE 1 (2026-09): disattivata. Scriveva immagini in hotlink verso
  // onepiece-cardgame.com (referrer-protected -> rotte in rendering) e usava
  // l'enum hardcoded + optcgapi (ferma a OP-12). One Piece JA e' Fase 1.5:
  // sara' gestita da scripts/sync-onepiece-ja.js con pipeline immagini
  // proprietaria. Qui NON tocchiamo i dati JA esistenti (nessuna regressione).
  log('\n[One Piece JA] disattivata in sync-full (vedi Fase 1.5 / sync-onepiece-ja.js)')
  SYNC_STATS.onePieceJA = { skipped: true, reason: 'phase-1.5' }
  return
}

async function _deadSyncOnePieceJA_optcgapi() {
  log('\n[One Piece JA] Derivata da optcgapi + CDN JP (ignoreDuplicates=true)...')
  const OPTCG    = 'https://optcgapi.com/api'
  const IMG_BASE = 'https://www.onepiece-cardgame.com/images/cardlist/card'

  const allSets = [
    ...Array.from({ length: 25 }, (_, i) => `OP-${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 30 }, (_, i) => `ST-${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 5 }, (_, i) => `EB-${String(i + 1).padStart(2, '0')}`),
  ]

  const toProcess = argSet
    ? allSets.filter(s => s.toLowerCase() === argSet.toLowerCase())
    : allSets

  let inserted = 0, setsFound = 0

  for (const setId of toProcess) {
    await sleep(DELAY_MS)

    const raw = await safeFetch(`${OPTCG}/sets/${setId}/?format=json`)
    if (!Array.isArray(raw) || !raw.length) continue

    // FIX (stesso motivo della versione EN sopra): niente piu' dedup che
  // scarta le Parallel -- ogni riga (base + _p1, _p2...) e' processata,
  // taggata via print_variant, id distinto. set_id gia' derivava
  // correttamente da setId (non da c.set_id) -- invariato qui.
    if (!raw.some(c => c.card_set_id)) continue

    const setCode = setId.replace('-', '').toLowerCase()   // "OP-01" â "op01"

    const rows = raw
      .filter(c => c.card_set_id)
      .map(c => {
        const isParallel = !!(c.card_image_id && /_p\d+$/.test(c.card_image_id))
        const cardId = isParallel ? `${c.card_set_id}:${c.card_image_id}` : c.card_set_id
        return {
          id:           `onepiece:optcg:${cardId}:ja`,
          source:       'optcg',
          source_id:    cardId,
          name:         c.card_name,   // nome EN â non sovrascrive se carta giÃ  presente
          set_id:       setCode,
          set_name:     setId,
          card_number:  c.card_set_id,
          rarity:       c.rarity || null,
          print_variant: isParallel ? 'parallel' : null,
          image_url:    `${IMG_BASE}/${cardId}.png`,
        image_url_hi: `${IMG_BASE}/${cardId}.png`,
        lang:         'ja',
        tcg:          'onepiece',
      }
    })

    // ignoreDuplicates: true â skip silenzioso se id giÃ  esiste (preserva nomi JA reali)
    if (!DRY_RUN) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const { error } = await supabase
          .from('cards')
          .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'id', ignoreDuplicates: true })
        if (error) console.warn(`  â  upsert error: ${error.message}`)
      }
    }

    inserted += rows.length
    setsFound++
    log(`  ${setId}: ${rows.length} carte`)
  }

  log(`  â One Piece JA: ${inserted} carte processate da ${setsFound} set`)
  SYNC_STATS.onePieceJA = { cardsProcessed: inserted, setsFound }
  log(`    (carte con nomi JA giÃ  presenti nel DB sono state preservate)`)
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// MAIN
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
const t0 = Date.now()

log(`ââââââââââââââââââââââââââââââââââââââââ`)
log(`â   DraGold Full Sync v3                â`)
log(`ââââââââââââââââââââââââââââââââââââââââ`)
log(`  Avvio: ${new Date().toISOString()}`)
log(`  TCG:   ${TCG_FILTER.join(', ')}`)
log(`  Lang:  ${LANG_FILTER.join(', ')}`)
log(`  Set:   ${argSet || 'tutti'}`)
log(`  Dry:   ${DRY_RUN ? 'SÃ â nessuna scrittura su DB' : 'no'}`)
log('')

try {
  if (TCG_FILTER.includes('pokemon')) {
    if (LANG_FILTER.includes('en')) await syncPokemonEN()
    if (LANG_FILTER.includes('ja')) await syncPokemonJA()
  }
  if (TCG_FILTER.includes('op')) {
    if (LANG_FILTER.includes('en')) await syncOnePieceEN()
    if (LANG_FILTER.includes('ja')) await syncOnePieceJA()
  }
} catch (err) {
  console.error('\nErrore critico:', err.message)
  console.error(err.stack)
  process.exit(1)
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
log(`\nâ Sync completato in ${elapsed}s`)
console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-full-report', tcg: TCG_FILTER, lang: LANG_FILTER, set: argSet || null, dryRun: DRY_RUN, elapsedSec: Number(elapsed), stats: SYNC_STATS }))
