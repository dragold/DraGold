/**
 * DraGold — Sync Pokémon JP (TCGdex /v2/ja)
 *
 * Fonte:  https://api.tcgdex.net/v2/ja
 * Lang:   'ja' (come nel resto del DB)
 * Ordine: set per releaseDate DESC (ultimi 3 anni prima, poi retroattivo)
 * Skip:   set già completi nel DB vengono saltati (upsert solo se mancano carte)
 *
 * Usage:
 *   node scripts/sync-pokemon-ja.js                 ← tutti i set JA
 *   node scripts/sync-pokemon-ja.js --set=sv3       ← forzare un set specifico
 *   node scripts/sync-pokemon-ja.js --dry-run       ← solo fetch, nessuna scrittura
 *   node scripts/sync-pokemon-ja.js --recent        ← solo ultimi 3 anni (2023+)
 *   node scripts/sync-pokemon-ja.js --force         ← riscrivere anche set già completi
 *
 * Env richiesti:
 *   SUPABASE_URL (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL (o VITE_SUPABASE_URL) e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TCGDEX_BASE  = 'https://api.tcgdex.net/v2'
const BATCH_SIZE   = 100
const DELAY_MS     = 250   // ms tra richieste (rate-limit conservativo)
const FETCH_TIMEOUT = 20000

// Data soglia "ultimi 3 anni" — 2023-01-01
const RECENT_CUTOFF = '2023-01-01'

// ─── Args CLI ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const argSet  = args.find(a => a.startsWith('--set='))?.split('=')[1]
const DRY_RUN = args.includes('--dry-run')
const RECENT  = args.includes('--recent')
const FORCE   = args.includes('--force')

// ─── Utilities ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log   = msg => process.stdout.write(msg + '\n')
const tick  = ()  => process.stdout.write('.')

async function safeFetch(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: {
        'User-Agent': 'DraGold-Sync/1.0 (dragold.org)',
        'Accept':     'application/json',
      },
    })
    if (!res.ok) {
      log(`  ⚠ HTTP ${res.status} → ${url}`)
      return null
    }
    return res.json()
  } catch (err) {
    log(`  ⚠ Fetch error (${err.message}) → ${url}`)
    return null
  }
}

async function upsertBatch(rows) {
  if (!rows.length || DRY_RUN) return
  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  if (error) log(`  ⚠ Upsert error: ${error.message}`)
}

/**
 * Conta quante carte JA di un set esistono già nel DB.
 */
async function countExisting(setId) {
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('tcg', 'pokemon')
    .eq('lang', 'ja')
    .eq('set_id', setId)
  return count || 0
}

// ─── Costruisce URL immagine JP ───────────────────────────────────────────────
/**
 * TCGdex JA restituisce c.image come path base senza estensione.
 * Formato CDN: https://assets.tcgdex.net/ja/{serieId}/{setId}/{num}/high.webp
 * Usiamo il path diretto dall'API quando presente, altrimenti ricostruiamo.
 */
function buildImageUrl(card, setId) {
  if (card.image) {
    // L'API restituisce qualcosa tipo "https://assets.tcgdex.net/ja/swsh/swsh1/1"
    return `${card.image}/high.webp`
  }
  // Fallback: CDN standard JA
  return `https://assets.tcgdex.net/ja/${setId}/${card.localId}/high.webp`
}

// ─── Sync principale ─────────────────────────────────────────────────────────
async function syncPokemonJA() {
  log('\n[Pokemon JA] Avvio sync da TCGdex /v2/ja...')

  // 1. Fetch lista set JA
  const rawSets = await safeFetch(`${TCGDEX_BASE}/ja/sets`)
  if (!Array.isArray(rawSets)) {
    log('  ✗ TCGdex JA /sets non disponibile — abort')
    process.exit(1)
  }

  // 2. Dedup per id (TCGdex a volte ritorna duplicati nella lista)
  const seen = new Set()
  const allSets = rawSets.filter(s => s.id && !seen.has(s.id) && seen.add(s.id))
  log(`  ${allSets.length} set JA unici dalla TCGdex API`)

  // 3. Filtra per --set specifico
  let toProcess = argSet
    ? allSets.filter(s => s.id.toLowerCase() === argSet.toLowerCase())
    : allSets

  // 4. Filtra --recent (solo 2023+)
  if (RECENT && !argSet) {
    toProcess = toProcess.filter(s => s.releaseDate && s.releaseDate >= RECENT_CUTOFF)
    log(`  Filtro --recent: ${toProcess.length} set dal ${RECENT_CUTOFF}`)
  }

  // 5. Ordina: recenti prima (releaseDate DESC), poi quelli senza data
  toProcess.sort((a, b) => {
    const da = a.releaseDate || '1990-01-01'
    const db = b.releaseDate || '1990-01-01'
    return db.localeCompare(da)
  })

  log(`  ${toProcess.length} set da processare (ordine: più recenti prima)`)
  log(`  Dry-run: ${DRY_RUN ? 'SÌ' : 'no'} | Force: ${FORCE ? 'SÌ' : 'no'}`)
  log('')

  let totalInserted = 0
  let skipped = 0
  let failed = 0
  const failedSets = []

  for (const meta of toProcess) {
    const setId   = meta.id
    const setName = meta.name || setId
    const dateStr = meta.releaseDate || 'n/d'
    const expected = meta.cardCount || 0

    // 6. Skip se già completo (a meno di --force)
    if (!FORCE && !argSet) {
      const existing = await countExisting(setId)
      if (existing >= expected && expected > 0) {
        tick()
        skipped++
        continue
      }
    }

    // 7. Fetch dettaglio set JA (include nomi JP e immagini JP)
    await sleep(DELAY_MS)
    const setData = await safeFetch(`${TCGDEX_BASE}/ja/sets/${setId}`)

    if (!setData?.cards?.length) {
      log(`  ⚠ ${setId} (${dateStr}): nessuna carta — skip`)
      failed++
      failedSets.push(setId)
      continue
    }

    // Nome ufficiale JP (dal dettaglio del set, più accurato della lista)
    const setNameJP = setData.name || setName

    // 8. Mappa le carte
    const rows = setData.cards
      .filter(c => c.localId && c.name)
      .map(c => ({
        id:           `pokemon:tcgdex:${setId}-${c.localId}:ja`,
        source:       'tcgdex',
        source_id:    `${setId}-${c.localId}`,
        name:         c.name,
        set_id:       setId,
        set_name:     setNameJP,
        card_number:  String(c.localId),
        rarity:       c.rarity   || null,
        supertype:    c.category || null,    // TCGdex JA usa "category" per supertype
        image_url:    buildImageUrl(c, setId),
        image_url_hi: buildImageUrl(c, setId),
        lang:         'ja',
        tcg:          'pokemon',
      }))

    if (!rows.length) {
      log(`  ⚠ ${setId}: nessuna carta valida dopo il filtro`)
      failed++
      failedSets.push(setId)
      continue
    }

    // 9. Upsert a batch
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }

    totalInserted += rows.length
    log(`  ✓ ${setId.padEnd(22)} ${setNameJP.padEnd(30)} (${dateStr})  ${rows.length} carte`)
  }

  // ─── Report finale ──────────────────────────────────────────────────────────
  log('')
  log('═══════════════════════════════════════════════')
  log(`  Pokemon JA sync completato`)
  log(`  Carte inserite/aggiornate : ${totalInserted}`)
  log(`  Set saltati (già completi) : ${skipped}`)
  log(`  Set falliti/vuoti          : ${failed}`)
  if (failedSets.length) {
    log(`  Set con problemi: ${failedSets.join(', ')}`)
  }
  if (DRY_RUN) log(`  ⚠ DRY-RUN — nessuna scrittura effettuata su DB`)
  log('═══════════════════════════════════════════════')
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now()

log('╔═══════════════════════════════════════════╗')
log('║   DraGold — Sync Pokémon JP (TCGdex JA)  ║')
log('╚═══════════════════════════════════════════╝')
log(`  Avvio: ${new Date().toISOString()}`)
log(`  Set:   ${argSet || (RECENT ? `ultimi 3 anni (>= ${RECENT_CUTOFF})` : 'tutti')}`)
log('')

try {
  await syncPokemonJA()
} catch (err) {
  console.error('\nErrore critico:', err.message)
  console.error(err.stack)
  process.exit(1)
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
log(`\n  Completato in ${elapsed}s`)
