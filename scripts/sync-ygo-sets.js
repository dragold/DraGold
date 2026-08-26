/**
 * DraGold - Sync set Yu-Gi-Oh (YGOPRODeck) -> set_logos
 *
 * Stesso scope ridotto di sync-mtg-sets.js: NON reimporta le carte YGO (gia'
 * presenti in `cards`, 14372 righe / 452 set distinti verificato il
 * 2026-08-23), popola solo set_code/set_name/release_date nella tabella
 * ESISTENTE `set_logos` (nessuna colonna/tabella nuova).
 *
 * Fonte: YGOPRODeck https://db.ygoprodeck.com/api/v7/cardsets.php (pubblico,
 * gratuito, nessuna key). Verificato raggiungibile da questo progetto solo
 * tramite lo strumento WebFetch di Claude in questa sessione, non da
 * device_bash/Bash dirette (proxy egress) -- in un ambiente CI con rete reale
 * (es. GitHub Actions) questo script funziona con un fetch diretto standard.
 *
 * In questa sessione, 12 set (i "Mega Pack" MPxx, quelli con piu' carte nel
 * catalogo `cards.tcg='ygo'` gia' presente) sono stati scritti manualmente
 * via query SQL diretta dopo verifica puntuale con WebFetch -- vedi report
 * finale del task. Questo script generalizza quel lavoro a TUTTI i set con
 * tcg_date valorizzato, pronto per un run reale in CI.
 *
 * Usage: node scripts/sync-ygo-sets.js [--dry-run]
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
const YGOPRO_SETS = 'https://db.ygoprodeck.com/api/v7/cardsets.php'

async function main() {
  console.log('Sync YGO sets (YGOPRODeck) -> set_logos - start')

  const res = await fetch(YGOPRO_SETS, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) {
    console.error(`BLOCKED_RUN: YGOPRODeck cardsets.php HTTP ${res.status}`)
    process.exit(1)
  }
  const sets = await res.json()
  if (!Array.isArray(sets)) {
    console.error('BLOCKED_RUN: risposta YGOPRODeck non e un array')
    process.exit(1)
  }

  // Solo set con tcg_date reale -- mai inventare una data mancante.
  const rows = sets
    .filter(s => s.set_code && s.tcg_date)
    .map(s => ({
      set_code: s.set_code,
      tcg: 'ygo',
      set_name: s.set_name,
      release_date: s.tcg_date,
      source: 'ygoprodeck',
      retrieved_at: new Date().toISOString(),
    }))

  console.log(`  ${rows.length}/${sets.length} set YGO con tcg_date reale`)

  if (DRY_RUN) {
    console.log('  [dry-run] nessuna scrittura su Supabase')
    console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-ygo-sets-report', dryRun: true, setsFound: rows.length }))
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

  console.log(`  OK: ${written} set YGO scritti in set_logos`)
  console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-ygo-sets-report', dryRun: false, setsWritten: written }))
}

main().catch(err => { console.error('Errore critico:', err.message); process.exit(1) })
