import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, classifyFinal } from '../summarize.mjs'

test('classifyFinal: A/B crawl -> VALID indipendentemente da resolve', () => {
  assert.equal(classifyFinal({ classification: 'A' }, null), 'VALID')
  assert.equal(classifyFinal({ classification: 'B' }, null), 'VALID')
})

test('classifyFinal: D (URL mancante) senza resolve riuscito -> MISSING', () => {
  assert.equal(classifyFinal({ classification: 'D' }, null), 'MISSING')
})

test('classifyFinal: C (404) senza tentativo di resolve -> BROKEN', () => {
  assert.equal(classifyFinal({ classification: 'C' }, null), 'BROKEN')
})

test('classifyFinal: C + resolve riuscito via tcgdex_retry -> RECOVERABLE_TCGDEX', () => {
  const r = classifyFinal({ classification: 'C' }, { resolved: true, source: 'tcgdex_retry', match_confidence: 'MEDIUM' })
  assert.equal(r, 'RECOVERABLE_TCGDEX')
})

test('classifyFinal: C + resolve riuscito via scrydex, match HIGH -> RECOVERABLE_SCRYDEX', () => {
  const r = classifyFinal({ classification: 'C' }, { resolved: true, source: 'scrydex', match_confidence: 'HIGH' })
  assert.equal(r, 'RECOVERABLE_SCRYDEX')
})

test('classifyFinal: resolve riuscito ma match_confidence LOW -> AMBIGUOUS, mai un RECOVERABLE_*', () => {
  const r = classifyFinal({ classification: 'C' }, { resolved: true, source: 'scrydex', match_confidence: 'LOW' })
  assert.equal(r, 'AMBIGUOUS')
})

test('classifyFinal: C + resolve tentato ma non risolto -> UNRESOLVED (non BROKEN, distinzione utile per report)', () => {
  const r = classifyFinal({ classification: 'C' }, { resolved: false })
  assert.equal(r, 'UNRESOLVED')
})

test('summarize: conta ogni carta una sola volta (dedup su field=image_url_hi)', () => {
  const crawl = [
    { card_id: 'x1', field: 'image_url', classification: 'A', lang: 'en', set_id: 's', card_number: '1' },
    { card_id: 'x1', field: 'image_url_hi', classification: 'A', lang: 'en', set_id: 's', card_number: '1' },
    { card_id: 'x2', field: 'image_url_hi', classification: 'C', lang: 'ja', set_id: 'MC', card_number: '2' },
  ]
  const { counts, details } = summarize(crawl, [])
  assert.equal(counts.TOTAL, 2)
  assert.equal(counts.VALID, 1)
  assert.equal(counts.BROKEN, 1)
  assert.equal(details.length, 2)
})

test('summarize: already_cached true SOLO se cache_status="ready", indipendentemente da final_classification', () => {
  const crawl = [
    { card_id: 'x1', field: 'image_url_hi', classification: 'A', lang: 'en', set_id: 's', card_number: '1', cache_status: 'ready' },
    { card_id: 'x2', field: 'image_url_hi', classification: 'C', lang: 'en', set_id: 's', card_number: '2', cache_status: 'ready' },
    { card_id: 'x3', field: 'image_url_hi', classification: 'A', lang: 'en', set_id: 's', card_number: '3', cache_status: 'pending' },
  ]
  const { details } = summarize(crawl, [])
  assert.equal(details.find(d => d.card_id === 'x1').already_cached, true)
  assert.equal(details.find(d => d.card_id === 'x2').already_cached, true, 'una carta rotta sulla source URL ma già cached deve restare already_cached=true')
  assert.equal(details.find(d => d.card_id === 'x3').already_cached, false)
})

test('summarize: cache_status assente nel record crawl (run pre-esistenti) -> "unknown", mai un crash', () => {
  const crawl = [
    { card_id: 'x1', field: 'image_url_hi', classification: 'A', lang: 'en', set_id: 's', card_number: '1' },
  ]
  const { details } = summarize(crawl, [])
  assert.equal(details[0].cache_status, 'unknown')
  assert.equal(details[0].already_cached, false)
})
