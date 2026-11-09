// DraGold: Script di popolamento prezzi per MVP sets tramite sync-prices-multi.
//
// Prerequisiti:
//   - Endpoint sync-prices-multi deployato con SERVICE_ROLE_KEY configurato
//   - curl disponibile
//
// Uso:
//   node scripts/populate-prices.js
//
// Lo script:
//   1. Legge la lista carte dai set MVP da un file JSON (cards-mvp.json)
//   2. Per ogni TCG, invoca sync-prices-multi con offset progressivo
//   3. Salva il report di copertura in price-coverage-report.json
//
// NOTA: questo script NON invoca direttamente la funzione — genera i comandi curl
// e li stampa su stdout per essere eseguiti manualmente, oppure può essere configurato
// per eseguire le chiamate con fetch nativo se l'endpoint è esposto pubblicamente.

const { readFileSync, writeFileSync } = require('fs')
const { resolve, dirname } = require('path')
const { fileURLToPath } = require('url')

const __dirname = dirname(fileURLToPath(import.meta.url))

// Configurazione MVP sets — carte per i quali popolare i prezzi
const MVP_SETS = {
  pokemon: [
    // Scarlet & Violet sets
    'sv01', 'sv02', 'sv03', 'sv04', 'sv05', 'sv06', 'sv07', 'sv08', 'sv09', 'sv10',
    'sv11', 'sv12', 'sv13', 'sv14', 'sv15', 'sv16', 'sv17', 'sv18', 'sv19', 'sv20',
    'sv21', 'sv22', 'sv23', 'sv24', 'sv25',
    // Sword & Shield sets — primi 10 più popolari
    'sw01', 'sw02', 'sw03', 'sw04', 'sw05',
    // XY — cento basici per coltivatori
    'xy01', 'xy02', 'xy03', 'xy04', 'xy05', 'xy06', 'xy07', 'xy08', 'xy09', 'xy10',
    'xy11', 'xy12', 'xy13', 'xy14', 'xy15', 'xy16',
    // Neo (advance generation)
    'neo1', 'neo2', 'neo3', 'neo4', 'neo5', 'neo6',
    // Scarlet & Violet—Elite Trainer Box common sets
    // (aggiungere in base alle collection reali degli utenti)
  ],
  onepiece: [
    'OP01', 'OP02', 'OP03', 'OP04', 'OP05',
    'OP06', 'OP07', 'OP08', 'OP09', 'OP10',
    'OP11', 'OP12', 'OP13', 'OP14', 'OP15',
    'OP16', 'OP17', 'OP18', 'OP19', 'OP20',
  ],
  yugioh: [
    // Aggiungere quando bulk-import-ygo ha popolato il catalogo
    // per ora commentato — YGO richiede source_id numerico
  ],
}

async function generateCardsList() {
  // In produzione, questa funzione farebbe una query Supabase per ottenere
  // tutti i card_id dei set MVP. Per ora, genera un file di esempio
  // che documenta la procedura.
  const report = {
    timestamp: new Date().toISOString(),
    mvp_sets: MVP_SETS,
    procedure: {
      description: 'Per popolare i prezzi per i set MVP, eseguire questi passaggi:',
      steps: [
        '1. Deployare sync-prices-multi con SERVICE_ROLE_KEY configurato come secret',
        '2. Per ogni TCG, eseguire:',
        '   curl -X POST https://pimwkmwrduqkaydyvxqz.supabase.co/functions/v1/sync-prices-multi \\',
        '     -H "Content-Type: application/json" \\',
        '     -d \'{"tcg": "pokemon", "limit": 20, "offset": 0}\'',
        '3. Ripetere con offset crescente finché next_offset non è null o 0',
        '4. Verificare coverage con: SELECT tcg, count(*) FROM card_prices GROUP BY tcg',
        '5. Per One Piece: eseguire con "tcg": "onepiece"',
      ],
    },
    note: {
      rate_limit: 'TCGdex ha rate limit non documentato. Mantenere ≤1 req/sec per evitare blocchi.',
      batch_size: '20 carte per chiamata (timeout Supabase 60s, TCGdex ~0.5-2s per carta)',
      coverage_target: 'Obiettivo: 80%+ per set MVP entro 1-2 settimane di popolamento progressivo.',
    },
  }

  const reportPath = resolve(__dirname, '..', 'price-coverage-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('Report di copertura prezzi generato:')
  console.log(`  File: ${reportPath}`)
  console.log('')
  console.log('MVP sets configurati:')
  for (const [tcg, sets] of Object.entries(MVP_SETS)) {
    console.log(`  ${tcg}: ${sets.length} set`)
  }
  console.log('')
  console.log('Procedura per popolamento:')
  report.procedure.steps.forEach(step => console.log(`  ${step}`))
  console.log('')
  console.log('Nota: questo script è un placeholder. In produzione, deployare sync-prices-multi')
  console.log('e invocare manualmente con curl (o scrivere uno script che usa @supabase/supabase-js')
  console.log('per invocare la funzione con service role key).')
}

generateCardsList().catch(err => {
  console.error('Errore:', err)
  process.exit(1)
})
