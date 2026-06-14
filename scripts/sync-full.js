/**
 * DraGold — Full Card Sync v2
 *
 * Fonti:
 *   Pokemon EN  → pokemontcg.io   (HD images, TCGPlayer prices, 20k+ carte)
 *   Pokemon JA  → TCGdex /v2/ja   (gratuita, multilingua)
 *   One Piece EN → optcgapi.com   (4347+ carte EN, gratuita)
 *   One Piece JA → jp.onepiece-cardgame.com  (scraping HTML ufficiale JP)
 *
 * Usage:
 *   node scripts/sync-full.js [--tcg pokemon,op] [--lang en,ja] [--set OP-05] [--dry-run]
 *
 * Env richiesti:
 *   SUPABASE_URL (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY
 *   POKEMONTCG_API_KEY  (opzionale — rate limits più alti su pokemontcg.io)
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config DB ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const PKM_API_KEY  = process.env.POKEMONTCG_API_KEY || ''

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL (o VITE_SUPABASE_URL) e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Costanti ─────────────────────────────────────────────────────────────────
const BATCH_SIZE  = 100    // righe per upsert batch
const DELAY_MS    = 200    // ms tra richieste HTTP esterne (rate-limiting gentile)
const DELAY_JP    = 500    // ms tra pagine JP (più cauteloso col sito ufficiale)
const FETCH_TIMEOUT = 25000

// ─── Args CLI ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2)
const argTcg    = args.find(a => a.startsWith('--tcg='))?.split('=')[1]?.split(',')
const argLang   = args.find(a => a.startsWith('--lang='))?.split('=')[1]?.split(',')
const argSet    = args.find(a => a.startsWith('--set='))?.split('=')[1]
const DRY_RUN   = args.includes('--dry-run')

const TCG_FILTER  = argTcg  || ['pokemon', 'op']
const LANG_FILTER = argLang || ['en', 'ja']

// ─── Utilities ────────────────────────────────────────────────────────────────
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
  if (error) console.warn(`  ⚠ upsert error: ${error.message}`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// POKEMON EN  →  pokemontcg.io
// ═══════════════════════════════════════════════════════════════════════════════
async function syncPokemonEN() {
  log('\n[Pokemon EN] pokemontcg.io...')
  const BASE    = 'https://api.pokemontcg.io/v2'
  const pkmHdr  = PKM_API_KEY ? { 'X-Api-Key': PKM_API_KEY } : {}

  // Probe per totalCount
  const probe = await safeFetch(`${BASE}/cards?pageSize=1&page=1`, { headers: pkmHdr })
  if (!probe?.totalCount) { log('  ✗ pokemontcg.io non disponibile'); return }

  const totalCount = probe.totalCount
  const totalPages = Math.ceil(totalCount / 250)
  log(`  ${totalCount} carte — ${totalPages} pagine da scaricare`)

  // Se richiesto set specifico, usare query q=set.id:{setId}
  const setQuery = argSet ? `&q=set.id:${argSet}` : ''

  let page = 1, inserted = 0

  while (page <= totalPages) {
    await sleep(DELAY_MS)
    const data = await safeFetch(
      `${BASE}/cards?pageSize=250&page=${page}&orderBy=id${setQuery}`,
      { headers: pkmHdr }
    )
    if (!data?.data?.length) break

    const rows = data.data.map(c => ({
      id:           `pkm:${c.id}:en`,
      name:         c.name,
      set_id:       c.set?.id   || null,
      set_name:     c.set?.name || null,
      card_number:  c.number,
      rarity:       c.rarity    || null,
      image_url:    c.images?.large || c.images?.small || null,
      image_url_hi: c.images?.large || null,
      lang:         'en',
      tcg:          'pokemon',
    }))

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length

    if (page % 10 === 0 || page === totalPages) {
      log(`  pagina ${page}/${totalPages} — ${inserted}/${totalCount}`)
    }
    page++

    // Se set specifico e non ci sono più pagine per quel set, esci
    if (argSet && data.data.length < 250) break
  }

  log(`  ✓ Pokemon EN: ${inserted} carte inserite/aggiornate`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// POKEMON JA  →  TCGdex /v2/ja
// ═══════════════════════════════════════════════════════════════════════════════
async function syncPokemonJA() {
  log('\n[Pokemon JA] TCGdex API...')
  const TCGDEX = 'https://api.tcgdex.net/v2'

  const sets = await safeFetch(`${TCGDEX}/ja/sets`)
  if (!Array.isArray(sets)) { log('  ✗ TCGdex JA non disponibile'); return }

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
        id:           `pkm:tcgdex:${meta.id}:${c.localId}:ja`,
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

  log(`\n  ✓ Pokemon JA: ${inserted} carte (${emptyCount} set vuoti/saltati)`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONE PIECE EN  →  optcgapi.com
// ═══════════════════════════════════════════════════════════════════════════════
async function syncOnePieceEN() {
  log('\n[One Piece EN] optcgapi.com...')
  const OPTCG = 'https://optcgapi.com/api'

  // Set da provare: OP-01..OP-16, ST-01..ST-24, promo
  // L'API restituisce 404 per set inesistenti → skip automatico
  const allSets = [
    ...Array.from({ length: 16 }, (_, i) => `OP-${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 24 }, (_, i) => `ST-${String(i + 1).padStart(2, '0')}`),
    'PR-01',
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

    // Dedup: un record per card_set_id, versione BASE (escludi parallel _p1, _p2...)
    const byCard = new Map()
    for (const c of raw) {
      if (!c.card_set_id) continue
      // Skip parallel: card_image_id termina con _p1, _p2, ecc.
      if (c.card_image_id && /_p\d+$/.test(c.card_image_id)) continue
      if (!byCard.has(c.card_set_id)) byCard.set(c.card_set_id, c)
    }

    if (!byCard.size) continue

    const rows = [...byCard.values()].map(c => ({
      id:           `op:optcg:${c.card_set_id}:en`,
      name:         c.card_name,
      set_id:       (c.set_id || '').replace('-', '').toLowerCase() || null,
      set_name:     c.set_name,
      card_number:  c.card_set_id,   // es. "OP01-001"
      rarity:       c.rarity || null,
      image_url:    c.card_image || null,
      image_url_hi: c.card_image || null,
      lang:         'en',
      tcg:          'op',
    }))

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length
    setsFound++
    log(`  ${setId}: ${rows.length} carte`)
  }

  log(`  ✓ One Piece EN: ${inserted} carte da ${setsFound} set`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONE PIECE JA  →  jp.onepiece-cardgame.com  (scraping HTML)
// ═══════════════════════════════════════════════════════════════════════════════
async function syncOnePieceJA() {
  log('\n[One Piece JA] jp.onepiece-cardgame.com...')
  const BASE = 'https://www.onepiece-cardgame.com'

  /**
   * Mappatura set → series ID del sito JP ufficiale.
   * Pattern confermato: OP-01 = series 550101, OP-16 = series 550116.
   * Formula: seriesId = `5501${setNum.toString().padStart(2,'0')}`
   *
   * Starter decks: non ancora mappati (series ID diverso da OP).
   * TODO: aggiungere ST mapping quando confermato.
   */
  const opSets = Array.from({ length: 16 }, (_, i) => ({
    setCode:  `OP${String(i + 1).padStart(2, '0')}`,      // "OP01"
    setName:  `OP-${String(i + 1).padStart(2, '0')}`,     // "OP-01"
    seriesId: `5501${String(i + 1).padStart(2, '0')}`,    // "550101"
  }))

  const toProcess = argSet
    ? opSets.filter(s =>
        s.setName.toLowerCase() === argSet.toLowerCase() ||
        s.setCode.toLowerCase() === argSet.toLowerCase()
      )
    : opSets

  let inserted = 0, failed = 0

  for (const { setCode, setName, seriesId } of toProcess) {
    await sleep(DELAY_JP)

    const url  = `${BASE}/cardlist/?series=${seriesId}`
    const html = await safeFetch(url, {
      headers: {
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Referer':         `${BASE}/`,
        'Cache-Control':   'no-cache',
      },
    })

    if (typeof html !== 'string' || html.length < 2000 || !html.includes('cardlist')) {
      log(`  ⚠ ${setName}: sito non raggiungibile o risposta vuota — saltato`)
      failed++
      continue
    }

    /**
     * Pattern HTML estratto ispezionando il DOM del sito:
     *   <img class="lazy" data-src="../images/cardlist/card/OP01-001.png?260518" alt="ロロノア・ゾロ">
     *
     * Cattura:
     *   group 1 → card ID base (es. "OP01-001")
     *   group 2 → nome JA (es. "ロロノア・ゾロ")
     *
     * Escludo parallel: i paralleli hanno pattern OP01-001_p2.png (con _p+cifra)
     */
    const cardRe = /data-src="\.\.\/images\/cardlist\/card\/(OP\d{2}-\d{3})\.png[^"]*"\s+alt="([^"]+)"/g

    const cards = new Map()
    let m
    while ((m = cardRe.exec(html)) !== null) {
      const cardId   = m[1]   // "OP01-001"
      const cardName = m[2]   // "ロロノア・ゾロ"
      if (!cards.has(cardId)) {
        cards.set(cardId, {
          id:           `op:optcg:${cardId}:ja`,
          name:         cardName,
          set_id:       setCode.toLowerCase(),    // "op01"
          set_name:     setName,                  // "OP-01"
          card_number:  cardId,                   // "OP01-001"
          rarity:       null,
          image_url:    `${BASE}/images/cardlist/card/${cardId}.png`,
          image_url_hi: `${BASE}/images/cardlist/card/${cardId}.png`,
          lang:         'ja',
          tcg:          'op',
        })
      }
    }

    if (!cards.size) {
      log(`  ⚠ ${setName}: nessuna carta estratta dall'HTML — pattern cambiato?`)
      failed++
      continue
    }

    const rows = [...cards.values()]
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await upsertBatch(rows.slice(i, i + BATCH_SIZE))
    }
    inserted += rows.length
    log(`  ${setName}: ${rows.length} carte`)
  }

  if (failed > 0) {
    log(`  ℹ ${failed} set falliti — probabilmente il sito JP blocca le richieste`)
    log(`    Soluzione: aggiungere secret ONEPIECE_JP_COOKIE con cookie di sessione valido`)
  }
  log(`  ✓ One Piece JA: ${inserted} carte inserite/aggiornate`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
const t0 = Date.now()

log(`╔═══════════════════════════════════════╗`)
log(`║   DraGold Full Sync v2                ║`)
log(`╚═══════════════════════════════════════╝`)
log(`  Avvio: ${new Date().toISOString()}`)
log(`  TCG:   ${TCG_FILTER.join(', ')}`)
log(`  Lang:  ${LANG_FILTER.join(', ')}`)
log(`  Set:   ${argSet || 'tutti'}`)
log(`  Dry:   ${DRY_RUN ? 'SÌ — nessuna scrittura su DB' : 'no'}`)
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
log(`\n✓ Sync completato in ${elapsed}s`)
