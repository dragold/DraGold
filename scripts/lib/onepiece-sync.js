import { assertCompleteIdentity, assertNoCanonicalFields } from './pokemon-sync.js'

export const ONEPIECE_MANAGED_FIELDS = [
  'name', 'set_id', 'set_name', 'card_number', 'rarity',
  'image_url', 'image_url_hi'
]

export function mergeOnePieceRow(existingRow, incoming, identity) {
  assertCompleteIdentity(identity)
  const merged = {
    id: identity.id,
    lang: identity.lang,
    tcg: identity.tcg,
    source: identity.source,
    source_id: identity.source_id,
  }
  for (const field of ONEPIECE_MANAGED_FIELDS) {
    const incomingVal = incoming ? incoming[field] : undefined
    
    // Regola: incomingVal vince se è valido (incluso '', 0, false).
    // Se incomingVal è null/undefined, vince existingRow (se esiste e non è null), altrimenti null.
    if (incomingVal !== null && incomingVal !== undefined) {
      merged[field] = incomingVal
    } else {
      merged[field] = existingRow && existingRow[field] !== undefined ? (existingRow[field] ?? null) : null
    }
  }
  assertNoCanonicalFields(merged)
  return merged
}
