/**
 * DraGold - Sync set MTG (Scryfall) -> set_logos
 *
 * Scope volutamente ridotto (requisito task "Catalog Sync + Enrichment Fix"):
 * NON reimporta le carte MTG (gia' presenti in `cards`, 27475 righe / 293 set
 * distinti verificato via query diretta il 2026-08-23) -- popola solo
 * set_code/set_name/release_date/logo reali nella tabella ESISTENTE
 * `set_logos` (stesso target gia' usato da pokemon/onepiece/ygo/lorcana in
 * questo blocco, nessuna tabella nuova), che e' quella letta dal frontend
 * (src/lib/state.js, src/lib/tcgSets.js, src/pages/set/setPageData.js).
 *
 * Fonte: Scryfall /sets (endpoint pubblico, gratuito, nessuna API key).
 * https://scryfall.com/docs/api/sets
 *
 * BLOCKER NOTO (documentato in dettaglio nel report finale del task): in
 * questa sessione di lavoro (device_bash, Bash del container, WebFetch) ogni
 * chiamata verso api.scryfall.com e' risultata bloccata (proxy egress
 * dell'ambiente per device_bash/Bash; 403 lato Scryfall stesso per WebFetch).
 * Lo script sotto e' scritto e pronto per l'esecuzione in un ambiente con
 * accesso di rete reale (es. GitHub Actions, che gia' non ha restrizioni di
 * egress per questo progetto) -- NON eseguito live in questa sessione, nessun
 * dato scritto su set_logos per tcg='mtg' da questo adapter.
 *
 * Usage: node scripts/sync-mtg-sets.js [--dry-run]
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
const SCRYFALL_SETS = 'https://api.scryfall.com/sets'

async function main() {
  console.log('Sync MTG sets (Scryfall) -> set_logos - start')

  const res = await fetch(SCRYFALL_SETS, {
    headers: { 'User-Agent': 'DraGold/1.0 (catalog sync)', 'Accept': 'application/json' },
  })
  if (!res.ok) {
    console.error(`BLOCKED_RUN: Scryfall /sets HTTP ${res.status}`)
    process.exit(1)
  }
  const body = await res.json()
  const sets = Array.isArray(body?.data) ? body.data : []
  if (!sets.length) {
    console.error('BLOCKED_RUN: risposta Scryfall senza data[]')
    process.exit(1)
  }

  // Solo set con release_date reale e code valorizzato -- mai inventare una
  // data mancante. digital=true (Arena-only) escluso: non ha stampe fisiche,
  // fuori dal dominio "carte collezionabili fisiche" del catalogo DraGold
  // (stesso principio gia' applicato a pokemon/onepiece/ygo/lorcana in questo
  // blocco: solo set reali e verificabili).
  const rows = sets
    .filter(s => s.code && s.released_at && !s.digital)
    .map(s => ({
      set_code: s.code.toLowerCase(),
      tcg: 'mtg',
      set_name: s.name,
      release_date: s.released_at,
      logo_url: s.icon_svg_uri || null,
      symbol_url: s.icon_svg_uri || null,
      source: 'scryfall',
      retrieved_at: new Date().toISOString(),
    }))

  console.log(`  ${rows.length}/${sets.length} set MTG con release_date reale (esclusi digital-only)`)

  if (DRY_RUN) {
    console.log('  [dry-run] nessuna scrittura su Supabase')
    console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-mtg-sets-report', dryRun: true, setsFound: rows.length }))
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

  console.log(`  OK: ${written} set MTG scritti in set_logos`)
  console.log('SYNC_REPORT_JSON=' + JSON.stringify({ kind: 'sync-mtg-sets-report', dryRun: false, setsWritten: written }))
}

main().catch(err => { console.error('Errore critico:', err.message); process.exit(1) })
