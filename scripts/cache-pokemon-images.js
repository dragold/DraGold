// scripts/cache-pokemon-images.js
// Priority 2 batch job: caches Pokémon EN/JA card images into the
// DraGold-hosted card_image_cache (via api/cache-image.js), so the
// frontend's cached_url -> image_url -> placeholder priority chain
// has cache data to serve for Pokémon too.
//
// Mirrors scripts/cache-onepiece-images.js exactly (same endpoint, same
// WebP conversion, same card_image_cache table). No new infra, no guessed
// CDN URL patterns: this reads cards.image_url, which is already populated
// by the existing Pokémon sync pipelines (sync-cards.js, sync-pokemon-ja.js,
// sync-pokemon-ptcg.js) from images.pokemontcg.io / assets.tcgdex.net —
// both already allow-listed in api/cache-image.js.
//
// Scope: tcg='pokemon', lang in ('en','ja') only (DraGold language priority:
// EN, JA — see CLAUDE.md/PRODUCT_SPEC.md).
//
// Usage: node scripts/cache-pokemon-images.js [--limit=N] [--dry-run]
//
// Env required: SUPABASE_URL, SUPABASE_SERVICE_KEY, IMAGE_CACHE_KEY
// Optional: CACHE_ENDPOINT (defaults to https://dragold.org/api/cache-image)

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const IMAGE_CACHE_KEY = process.env.IMAGE_CACHE_KEY
const CACHE_ENDPOINT = process.env.CACHE_ENDPOINT || 'https://dragold.org/api/cache-image'
const CONCURRENCY = 5
const DELAY_MS = 150
const LANGS = ['en', 'ja']

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find(function (a) { return a.startsWith('--limit=') })
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
if (!IMAGE_CACHE_KEY) {
  console.error('Missing IMAGE_CACHE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

async function fetchCardsToCache() {
  const pageSize = 1000
  let from = 0
  let all = []
  while (true) {
    const page = await supabase
      .from('cards')
      .select('id, image_url, lang')
      .eq('tcg', 'pokemon')
      .in('lang', LANGS)
      .not('image_url', 'is', null)
      .range(from, from + pageSize - 1)
    if (page.error) throw page.error
    const data = page.data
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }

  // Paginate the "already ready" side too: 52k+ candidate rows means the
  // ready set can be large as this job runs repeatedly over time.
  let readyAll = []
  let rFrom = 0
  while (true) {
    const cachePage = await supabase
      .from('card_image_cache')
      .select('card_id, status')
      .eq('status', 'ready')
      .range(rFrom, rFrom + pageSize - 1)
    if (cachePage.error) throw cachePage.error
    const data = cachePage.data
    if (!data || data.length === 0) break
    readyAll = readyAll.concat(data)
    if (data.length < pageSize) break
    rFrom += pageSize
  }
  const readySet = new Set(readyAll.map(function (r) { return r.card_id }))

  return all.filter(function (c) { return !readySet.has(c.id) })
}

async function cacheOne(card) {
  const body = {
    cardId: card.id,
    source: 'pokemon',
    imageUrl: card.image_url,
    language: card.lang || 'en',
    variant: 'default',
  }
  try {
    const res = await fetch(CACHE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': IMAGE_CACHE_KEY,
      },
      body: JSON.stringify(body),
    })
    let json = null
    try { json = await res.json() } catch (parseErr) { json = null }
    if (!res.ok || !json || !json.ok) {
      const errMsg = (json && json.error) || ('HTTP ' + res.status)
      return { cardId: card.id, ok: false, error: errMsg }
    }
    return { cardId: card.id, ok: true, bytes: json.bytes || 0, width: json.width, height: json.height, format: json.format }
  } catch (e) {
    return { cardId: card.id, ok: false, error: e.message || String(e) }
  }
}

async function main() {
  console.log('===========================================')
  console.log('DraGold - Batch cache-image Pokémon (EN/JA)')
  console.log('===========================================')
  console.log('Avvio:', new Date().toISOString())

  let cards = await fetchCardsToCache()
  console.log('Carte Pokémon EN/JA da cachare: ' + cards.length)
  if (limit) {
    cards = cards.slice(0, limit)
    console.log('Limit applicato: ' + cards.length)
  }

  if (dryRun) {
    console.log('DRY-RUN: nessuna chiamata effettuata.')
    return
  }

  let ok = 0
  let failed = 0
  let totalBytes = 0
  const errors = []

  let i = 0
  async function worker() {
    while (i < cards.length) {
      const idx = i
      i = i + 1
      const card = cards[idx]
      const result = await cacheOne(card)
      if (result.ok) {
        ok = ok + 1
        totalBytes = totalBytes + (result.bytes || 0)
      } else {
        failed = failed + 1
        errors.push(result.cardId + ': ' + result.error)
      }
      if ((ok + failed) % 100 === 0) {
        console.log('Progresso: ' + (ok + failed) + '/' + cards.length + ' (ok=' + ok + ' failed=' + failed + ')')
      }
      await sleep(DELAY_MS)
    }
  }

  const workerList = []
  for (let w = 0; w < CONCURRENCY; w = w + 1) {
    workerList.push(worker())
  }
  await Promise.all(workerList)

  console.log('===============================================')
  console.log('Batch completato')
  console.log('Immagini cachate con successo: ' + ok)
  console.log('Fallite: ' + failed)
  console.log('Storage totale caricato (bytes): ' + totalBytes)
  console.log('Storage totale caricato (MB): ' + (totalBytes / (1024 * 1024)).toFixed(2))
  if (errors.length > 0) {
    console.log('Prime 20 errori:')
    errors.slice(0, 20).forEach(function (e) { console.log(' - ' + e) })
  }
  console.log('===============================================')
}

main().catch(function (e) {
  console.error('Errore fatale:', e)
  process.exit(1)
})
