/**
 * DraGold - Sync set Disney Lorcana (Lorcast) -> set_logos
 *
 * Preparazione ingestion Lorcana, SOLO adapter/set metadata (requisito task:
 * "solo preparazione ingestion, non l'intero frontend Lorcana"). Scrive
 * esclusivamente in `set_logos` (stessa tabella gia' usata da tutti gli altri
 * TCG in questo blocco) -- NON tocca `cards`, NON aggiunge un import carte
 * completo, NON tocca `public.sets` (tabella scaffold separata, non letta dal
 * frontend -- vedi verifica in questo task: src/lib/state.js e
 * src/lib/tcgSets.js leggono `set_logos`, non `public.sets`). Nessuna nuova
 * architettura introdotta.
 *
 * Fonte: Lorcast https://api.lorcast.com/v0/sets (pubblico, gratuito).
 *
 * Usage: node scripts/sync-lorcana-sets.js [--dry-run]
 * Env richiesti: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const LORCAST_SETS = 'https://api.lorcast.com/v0/sets'

async function main() {
  console.log('Sync Lorcana sets (Lorcast) -> set_logos - start')

  const res = await fetch(LORCAST_SETS, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) {
    console.error(`BLOCKED_RUN: Lorcast /v0/sets HTTP ${res.status}`)
    process.exit(1)
  }
  const body = await res.json()
  const sets = Array.isArray(body?.results) ? body.results : []
  if (!sets.length) {
    console.error('BLOCKED_RUN: risposta Lorcast senza results[]')
    process.exit(1)
  }

  const rows = sets
    .filter(s => s.code && s.released_at)
    .map(s => ({
      set_code: String(s.code),
      tcg: 'lorcana',
      set_name: s.name,
      release_date: s.released_at,
      source: 'lorcast',
      retrieved_at: new Date().toISOString(),
    }))

  console.log(`  ${rows.length}/${sets.length} set Lorcana con released_at reale`)

  if (DRY_RUN) {
    console.log('  [dry-run] nessuna scrittura su Supabase')
    console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-lorcana-sets-report', dryRun: true, setsFound: rows.length }))
    return
  }

  const BATCH_SIZE = 200
  let written = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('set_logos').upsert(batch, { onConflict: 'set_code,tcg' })
    if (error) { console.error('  upsert error:', error.message); process.exit(1) }
    written += batch.length
  }

  console.log(`  OK: ${written} set Lorcana scritti in set_logos`)
  console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-lorcana-sets-report', dryRun: false, setsWritten: written }))
}

main().catch(err => { console.error('Errore critico:', err.message); process.exit(1) })
