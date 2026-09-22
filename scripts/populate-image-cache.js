// DraGold: Script di popolamento image cache per active sets.
//
// Prerequisiti:
//   - Node.js con @supabase/supabase-js installato (npm install @supabase/supabase-js)
//   - Variabili d'ambiente: SUPABASE_URL, SUPABASE_ANON_KEY
//
// Uso:
//   node scripts/populate-image-cache.js --input cards.json --limit 100
//
// Il file cards.json deve contenere un array di card_id:
//   ["pokemon:tcgdex:sv07-136:en", "pokemon:tcgdex:sv07-136:ja", ...]
//
// Questi card_id possono essere ottenuti con una query Supabase:
//   SELECT id FROM cards WHERE set_id IN ('sv07', 'xy12', 'neo4') LIMIT 1000;
//
// Lo script invoca la edge function cache-image per ogni carta
// e salva i risultati in un report JSON.

const { createClient } = require('@supabase/supabase-js')
const { readFileSync, writeFileSync } = require('fs')
const { resolve, dirname } = require('path')
const { fileURLToPath } = require('url')

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pimwkmwrduqkaydyvxqz.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''

if (!SUPABASE_ANON_KEY) {
  console.error('ERRORE: SUPABASE_ANON_KEY non impostata')
  console.error('Impostala con: export SUPABASE_ANON_KEY=< tua chiave anonima >')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function cacheImage(cardId, force = false) {
  const { data, error } = await supabase.functions.invoke('cache-image', {
    body: { card_id: cardId, force },
  })

  if (error) {
    return { card_id: cardId, ok: false, error: error.message }
  }

  return data
}

async function main() {
  const args = process.argv.slice(2)
  let inputFile = ''
  let limit = 100
  let force = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputFile = args[i + 1]
      i++
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--force') {
      force = true
      i++
    }
  }

  if (!inputFile) {
    console.error('Usage: node populate-image-cache.js --input cards.json [--limit N] [--force]')
    process.exit(1)
  }

  const inputPath = resolve(__dirname, '..', inputFile)
  const raw = readFileSync(inputPath, 'utf-8')
  const cards = JSON.parse(raw)

  if (!Array.isArray(cards)) {
    console.error('ERRORE: il file input deve contenere un array JSON di card_id')
    process.exit(1)
  }

  console.log(`Inizio popolamento per ${cards.length} carte (limit: ${limit}, force: ${force})`)

  const results = []
  let success = 0
  let cached = 0
  let failed = 0
  let alreadyCached = 0

  for (let i = 0; i < Math.min(cards.length, limit); i++) {
    const cardId = cards[i]
    const result = await cacheImage(cardId, force)

    results.push(result)

    if (result.ok) {
      success++
      if (result.cached) {
        cached++
        alreadyCached++
      } else if (result.cached_url) {
        cached++
      }
    } else {
      failed++
      console.error(`FAIL ${cardId}: ${result.error}`)
    }

    // Rate limit: 1 chiamata/sec per non saturare
    if (i % 10 === 9) {
      console.log(`Progress: ${i + 1}/${Math.min(cards.length, limit)} — success: ${success}, cached: ${cached}, failed: ${failed}`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Salva report
  const reportPath = resolve(__dirname, '..', 'image-cache-report.json')
  const report = {
    timestamp: new Date().toISOString(),
    input_file: inputFile,
    total_cards: cards.length,
    processed: Math.min(cards.length, limit),
    success,
    cached,
    already_cached: alreadyCached,
    failed,
    results,
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\nCompletato:')
  console.log(`  Totale carte: ${cards.length}`)
  console.log(`  Processate: ${Math.min(cards.length, limit)}`)
  console.log(`  Success: ${success}`)
  console.log(`  Cached (nuovo): ${cached - alreadyCached}`)
  console.log(`  Già cached: ${alreadyCached}`)
  console.log(`  Fallite: ${failed}`)
  console.log(`\nReport salvato in: ${reportPath}`)
}

main().catch(err => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
