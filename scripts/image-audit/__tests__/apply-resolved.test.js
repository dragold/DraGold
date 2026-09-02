import test from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs, shouldApply } from '../apply-resolved.mjs'

test('parseArgs: --in mancante -> errore esplicito', () => {
  assert.throws(() => parseArgs(['node', 'apply-resolved.mjs']), /--in=/)
})

test('parseArgs: default min-confidence=HIGH, dry-run=false', () => {
  const a = parseArgs(['node', 'apply-resolved.mjs', '--in=x.ndjson'])
  assert.equal(a.inPath, 'x.ndjson')
  assert.equal(a.minConfidence, 'HIGH')
  assert.equal(a.dryRun, false)
})

test('parseArgs: --min-confidence=NO_MATCH rifiutato esplicitamente (mai applicare un non-match)', () => {
  assert.throws(() => parseArgs(['node', 'apply-resolved.mjs', '--in=x.ndjson', '--min-confidence=NO_MATCH']), /non valido/)
})

test('parseArgs: --min-confidence sconosciuto -> errore', () => {
  assert.throws(() => parseArgs(['node', 'apply-resolved.mjs', '--in=x.ndjson', '--min-confidence=WHATEVER']), /non valido/)
})

test('parseArgs: --dry-run riconosciuto', () => {
  const a = parseArgs(['node', 'apply-resolved.mjs', '--in=x.ndjson', '--dry-run'])
  assert.equal(a.dryRun, true)
})

test('shouldApply: not resolved -> mai applicata', () => {
  const d = shouldApply({ resolved: false, match_confidence: 'NO_MATCH' })
  assert.equal(d.apply, false)
  assert.equal(d.reason, 'not_resolved')
})

test('shouldApply: resolved ma senza url -> mai applicata (nessun URL indovinato)', () => {
  const d = shouldApply({ resolved: true, url: null, match_confidence: 'HIGH' })
  assert.equal(d.apply, false)
})

test('shouldApply: confidenza MEDIUM con soglia default HIGH -> skip', () => {
  const d = shouldApply({ resolved: true, url: 'https://x/y.png', match_confidence: 'MEDIUM' })
  assert.equal(d.apply, false)
  assert.equal(d.reason, 'confidence_too_low')
})

test('shouldApply: confidenza MEDIUM con soglia esplicita MEDIUM -> applicata', () => {
  const d = shouldApply({ resolved: true, url: 'https://x/y.png', match_confidence: 'MEDIUM' }, { minConfidence: 'MEDIUM' })
  assert.equal(d.apply, true)
})

test('shouldApply: HIGH ma la carta ha già un image_url_hi -> mai sovrascritta alla cieca', () => {
  const d = shouldApply(
    { resolved: true, url: 'https://x/y.png', match_confidence: 'HIGH' },
    { existingImageUrlHi: 'https://gia-presente/z.png' }
  )
  assert.equal(d.apply, false)
  assert.equal(d.reason, 'already_has_image_url_hi')
})

test('shouldApply: HIGH + nessuna immagine esistente -> applicata', () => {
  const d = shouldApply(
    { resolved: true, url: 'https://x/y.png', match_confidence: 'HIGH' },
    { existingImageUrlHi: null }
  )
  assert.equal(d.apply, true)
  assert.equal(d.reason, null)
})
