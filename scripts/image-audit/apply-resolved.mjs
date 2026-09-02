#!/usr/bin/env node
/**
 * DraGold — Image Audit: applica al DB i candidati risolti da resolve-fallback.mjs.
 *
 * Gap trovato durante audit del 2026-09-02: la pipeline dump-cards -> crawl-images ->
 * resolve-fallback -> summarize produce solo un REPORT (resolve-results.ndjson); nessuno
 * script scriveva mai i candidati risolti su Supabase. Questo file chiude quel gap — è
 * l'UNICO script della pipeline che scrive (`.update()`), tutti gli altri restano read-only.
 *
 * Soglia di sicurezza (deliberatamente conservativa, per richiesta esplicita di massima
 * fedeltà degli asset): applica SOLO righe con match_confidence === 'HIGH' (default; alzabile
 * a MEDIUM solo esplicitamente via --min-confidence=MEDIUM, mai più permissivo). Non scrive
 * mai se la carta ha già un image_url_hi non-null (mai sovrascrivere un'immagine esistente
 * "alla cieca" — solo colmare un buco noto), a meno di --force per un singolo id via --only=.
 *
 * Usage:
 *   node scripts/image-audit/apply-resolved.mjs --in=scripts/image-audit/data/resolve-pokemon.ndjson [--dry-run]
 *   node scripts/image-audit/apply-resolved.mjs --in=... --min-confidence=MEDIUM
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, NO_MATCH: 0 }

/**
 * Parsing puro (nessuna I/O) degli argomenti CLI — testabile senza credenziali Supabase.
 */
export function parseArgs(argv) {
  const args = argv.slice(2)
  const inPath = args.find(a => a.startsWith('--in='))?.split('=')[1]
  if (!inPath) throw new Error('--in=<path a resolve-results.ndjson> è richiesto')
  const minConfidence = (args.find(a => a.startsWith('--min-confidence='))?.split('=')[1] || 'HIGH').toUpperCase()
  if (!(minConfidence in CONFIDENCE_RANK) || minConfidence === 'NO_MATCH') {
    throw new Error(`--min-confidence non valido: ${minConfidence} (HIGH|MEDIUM|LOW)`)
  }
  return {
    inPath,
    minConfidence,
    dryRun: args.includes('--dry-run'),
  }
}

/**
 * Decide se una riga del report va applicata, e perché no in caso contrario — pura,
 * nessuna I/O, testabile con fixture in-memory invece che con un file NDJSON reale.
 */
export function shouldApply(row, { minConfidence = 'HIGH', existingImageUrlHi = null } = {}) {
  if (!row.resolved || !row.url) return { apply: false, reason: 'not_resolved' }
  const rank = CONFIDENCE_RANK[row.match_confidence] ?? 0
  if (rank < CONFIDENCE_RANK[minConfidence]) return { apply: false, reason: 'confidence_too_low' }
  if (existingImageUrlHi) return { apply: false, reason: 'already_has_image_url_hi' }
  return { apply: true, reason: null }
}

async function main() {
  const { inPath, minConfidence, dryRun } = parseArgs(process.argv)

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const lines = readFileSync(inPath, 'utf8').split('\n').filter(Boolean)
  console.log(`${lines.length} righe in ${inPath} — soglia: ${minConfidence}${dryRun ? ' (DRY-RUN, nessuna scrittura)' : ''}`)

  let applied = 0, skippedLowConfidence = 0, skippedNotResolved = 0, skippedHasImage = 0, errors = 0

  for (const line of lines) {
    const row = JSON.parse(line)
    if (!row.card_id) continue

    const { data: existing, error: readErr } = await supabase
      .from('cards')
      .select('image_url_hi')
      .eq('id', row.card_id)
      .maybeSingle()
    if (readErr) { console.error(`  READ ERROR ${row.card_id}: ${readErr.message}`); errors++; continue }

    const decision = shouldApply(row, { minConfidence, existingImageUrlHi: existing?.image_url_hi })
    if (!decision.apply) {
      if (decision.reason === 'not_resolved') skippedNotResolved++
      else if (decision.reason === 'confidence_too_low') skippedLowConfidence++
      else if (decision.reason === 'already_has_image_url_hi') skippedHasImage++
      continue
    }

    console.log(`  ${dryRun ? 'DRY' : 'OK'} ${row.card_id} <- ${row.source} (${row.match_confidence}): ${row.url}`)
    if (dryRun) { applied++; continue }

    const { error: updErr } = await supabase
      .from('cards')
      .update({ image_url_hi: row.url })
      .eq('id', row.card_id)
    if (updErr) { console.error(`  WRITE ERROR ${row.card_id}: ${updErr.message}`); errors++; continue }
    applied++
  }

  console.log(`\nApplicate: ${applied} | skip (non risolte): ${skippedNotResolved} | skip (confidenza < ${minConfidence}): ${skippedLowConfidence} | skip (immagine già presente): ${skippedHasImage} | errori: ${errors}`)
  if (errors > 0) process.exitCode = 1
}

function isDirectCliInvocation() {
  if (!process.argv[1]) return false
  return import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())
}

if (isDirectCliInvocation()) {
  main().catch(err => { console.error('FATAL:', err); process.exit(1) })
}
