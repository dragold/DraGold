import { test, describe } from 'node:test'
import assert from 'node:assert'
import { mergeOnePieceRow } from '../onepiece-sync.js'

describe('One Piece Sync - mergeOnePieceRow', () => {
  test('Identity validation', () => {
    assert.throws(() => mergeOnePieceRow(null, {}, { id: 'x' }), /assertCompleteIdentity/)
  })

  test('Managed fields only', () => {
    const existing = {
      id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1',
      name: 'Luffy', set_id: 'op01', rarity: 'C',
      metadata: { ja_official: {} }, // Unmanaged field
      canonical_card_id: '123'
    }
    const identity = { id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1' }
    const incoming = { name: 'Luffy v2', rarity: 'R' }

    const merged = mergeOnePieceRow(existing, incoming, identity)
    
    assert.strictEqual(merged.name, 'Luffy v2')
    assert.strictEqual(merged.rarity, 'R')
    assert.strictEqual(merged.metadata, undefined) // non upserta campi non gestiti
    assert.strictEqual(merged.canonical_card_id, undefined) // non tocca canonical
  })

  test('Null protection', () => {
    const existing = {
      id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1',
      name: 'Luffy', rarity: 'C', image_url: 'http://old'
    }
    const identity = { id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1' }
    
    // Incoming manda null/undefined
    const merged = mergeOnePieceRow(existing, { name: null, rarity: undefined, image_url: '' }, identity)
    
    assert.strictEqual(merged.name, 'Luffy') // Protetto
    assert.strictEqual(merged.rarity, 'C') // Protetto
    assert.strictEqual(merged.image_url, '') // Valid falsy string, sovrascrive
  })

  test('Valid zero and false', () => {
    const existing = { id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1', rarity: 'C', card_number: '1' }
    const identity = { id: 'op:1', lang: 'en', tcg: 'onepiece', source: 'optcg', source_id: '1' }
    const merged = mergeOnePieceRow(existing, { rarity: 0, card_number: false }, identity)
    assert.strictEqual(merged.rarity, 0)
    assert.strictEqual(merged.card_number, false)
  })
})
