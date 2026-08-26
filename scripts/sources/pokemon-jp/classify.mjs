// classify.mjs
// Reconciles one discovered official-site record against the existing DraGold
// `cards` snapshot (a local NDJSON dump -- this module never touches Supabase).
// Reuses the existing match-confidence scorer rather than inventing a new one.
//
// TAXONOMY (definitive for the MODERN Pokémon JP pipeline -- reconstructed from the
// pre-existing code/tests and consolidated into a coherent, non-speculative form):
//
//   MISSING_FROM_SOURCE - the official-site id resolved to a gap on this pass (the
//                          record `discovered.found === false`). Meaningful only in
//                          combination with the caller's own known-ids ledger; this
//                          module stays stateless.
//   NEW                 - the card was found on the source, but no existing DraGold row
//                          scores as a plausible match at all (NO_MATCH / no candidate).
//                          Kept from the pre-existing taxonomy: without it there would be
//                          no way to represent "genuinely new card", which is a distinct,
//                          necessary state (not speculative -- both classify.mjs and its
//                          tests already depended on it).
//   AMBIGUOUS           - either (a) the best candidate's text-match confidence is LOW or
//                          MEDIUM (never auto-classified as CHANGED/UNCHANGED, per the
//                          non-negotiable mission rule carried over from Mission 2/3), or
//                          (b) the candidate is HIGH-confidence but image HTTP validation
//                          came back inconclusive for a non-deterministic reason (network
//                          error/timeout/429/5xx after retries) -- we never invent a
//                          deterministic IMAGE_INVALID verdict from a transient condition.
//   IMAGE_MISSING       - HIGH-confidence candidate, but NO usable image URL was extracted
//                          from the source page's markup at all (extract-image.mjs found
//                          neither image_url nor image_url_hi). This is purely about
//                          EXTRACTION, never about HTTP validation.
//   IMAGE_INVALID       - HIGH-confidence candidate, an image URL WAS extracted from the
//                          markup, but real HTTP validation (validate-image.mjs) proved
//                          the resource is not usable: 404/410, 403/401 (blocked/WAF), or
//                          a 2xx response that is not actually an image (bad content-type
//                          / magic bytes). Deterministic outcomes only -- see AMBIGUOUS
//                          above for the transient/non-deterministic case.
//   CHANGED             - HIGH-confidence candidate, image extracted and (when validated)
//                          usable, and at least one tracked field differs from the
//                          existing DraGold row: name, card number, or image_url_hi. Image
//                          changes are folded into this single bucket (rather than a
//                          separate IMAGE_CHANGED classification some earlier prototype
//                          code used) because from the taxonomy's point of view a changed
//                          image URL is just another changed field, same as name/number.
//   UNCHANGED           - HIGH-confidence candidate, image usable, no tracked field
//                          differs from the existing DraGold row. (Named UNCHANGED here;
//                          pre-existing code called this EXISTING -- renamed for
//                          consistency with the CHANGED/UNCHANGED pairing the taxonomy
//                          calls for. Same semantics, no behavior change.)
//
// LEGACY preparation (see CATALOG_RECONCILIATION_PIPELINE_PROPOSAL.md and the mission
// brief): the LEGACY path is reconciliation-only (never discovery) and is NOT implemented
// in this pass. The one thing LEGACY will need from MODERN is this same taxonomy, so it is
// exported as a frozen constant (CLASSIFICATIONS) rather than left as inline string
// literals scattered across callers. A future classify-legacy.mjs can reuse
// CLASSIFICATIONS directly instead of redefining it; MISSING_FROM_SOURCE and NEW are
// unlikely to apply there (no discovery => no "gap" or "brand-new id" concept) but
// CHANGED/UNCHANGED/AMBIGUOUS/IMAGE_MISSING/IMAGE_INVALID all carry over unchanged. This
// is intentionally the smallest possible contract: a shared vocabulary, nothing else.

import { scoreMatch } from '../../image-audit/match-confidence.mjs'

export const CLASSIFICATIONS = Object.freeze({
  MISSING_FROM_SOURCE: 'MISSING_FROM_SOURCE',
  NEW: 'NEW',
  AMBIGUOUS: 'AMBIGUOUS',
  IMAGE_MISSING: 'IMAGE_MISSING',
  IMAGE_INVALID: 'IMAGE_INVALID',
  CHANGED: 'CHANGED',
  UNCHANGED: 'UNCHANGED',
})

// findCandidate: cheap pre-filter (same lang + same card number) before scoring,
// so we don't run the full scorer against the whole table for every discovered card.
//
// officialSetCode (optional): the official set code read directly off the source page's
// own image path via extractSetCode() (extract-image.mjs) -- e.g. "MC". When present, a
// pool candidate whose set_id matches it exactly always wins over one that doesn't,
// regardless of scoreMatch's level, because the official set code is stronger evidence
// than any text-similarity heuristic: it is read straight from the authoritative source
// for THIS exact card, not inferred or guessed. scoreMatch itself is not touched --
// this only changes which candidate in the pool is picked as `best`; the winning
// candidate's match.level (computed exactly as before) still decides AMBIGUOUS vs
// CHANGED/UNCHANGED/IMAGE_* downstream in classifyDiscovered, unchanged.
export function findCandidate(discovered, dbRows, officialSetCode = null) {
  if (!discovered.cardNumber) return null
  const num = discovered.cardNumber.split('/')[0]
  const pool = dbRows.filter((r) => r.lang === 'ja' && r.card_number && r.card_number.split('/')[0] === num)
  if (pool.length === 0) return null
  let best = null
  let bestScore = null
  let bestSetMatches = false
  for (const row of pool) {
    const s = scoreMatch(row, {
      name: discovered.name,
      number: discovered.cardNumber,
      set: discovered.primarySetName,
      lang: 'ja',
    })
    const setMatches = officialSetCode != null && row.set_id != null
      && String(row.set_id).toLowerCase() === String(officialSetCode).toLowerCase()
    const better = !best
      || (setMatches && !bestSetMatches)
      || (setMatches === bestSetMatches && rank(s.level) > rank(bestScore.level))
    if (better) { best = row; bestScore = s; bestSetMatches = setMatches }
  }
  return best ? { row: best, match: bestScore } : null
}

function rank(level) {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, NO_MATCH: 0 }[level] ?? 0
}

// classifyDiscovered: the MODERN-pipeline classification step. Called after
// discover -> fetch -> parse -> extract-image -> validate-image (see sync-dry-run.mjs
// for the orchestration). `imageValidation`, when provided via opts, is the result of
// actually calling validate-image.mjs's validateImageUrl() against the extracted image
// URL -- never inferred or guessed here. When omitted (null/undefined), no HTTP
// validation was performed for this record (e.g. no image URL was extracted at all, so
// there was nothing to validate) and the IMAGE_INVALID/AMBIGUOUS-from-image branches
// below are simply not reachable.
export function classifyDiscovered(discovered, dbRows, imageInfo, opts = {}) {
  const { imageValidation = null } = opts

  if (!discovered.found) {
    // id resolved to a gap on this pass. Only meaningful if we previously believed
    // a card lived at this official_source_id (tracked separately by the caller via
    // the checkpoint/known-ids ledger) -- classify.mjs itself stays stateless.
    return { classification: CLASSIFICATIONS.MISSING_FROM_SOURCE, candidate: null, match: null, imageValidation: null }
  }

  const officialSetCode = imageInfo?.setCode ?? null
  const candidate = findCandidate(discovered, dbRows, officialSetCode)

  if (!candidate || candidate.match.level === 'NO_MATCH') {
    return { classification: CLASSIFICATIONS.NEW, candidate: null, match: candidate ? candidate.match : null, imageValidation: null }
  }

  if (candidate.match.level === 'LOW' || candidate.match.level === 'MEDIUM') {
    // Per mission rule (carried over from Mission 2/3): never auto-classify below HIGH
    // confidence as a clean UNCHANGED/CHANGED -- surface for manual review instead.
    return { classification: CLASSIFICATIONS.AMBIGUOUS, candidate: candidate.row, match: candidate.match, imageValidation: null }
  }

  // HIGH confidence match from here on.
  const row = candidate.row

  if (imageInfo) {
    const hasExtractedUrl = Boolean(imageInfo.image_url_hi || imageInfo.image_url)

    if (!hasExtractedUrl) {
      // Extraction-level gap: nothing in the markup to even attempt validating.
      return { classification: CLASSIFICATIONS.IMAGE_MISSING, candidate: row, match: candidate.match, imageValidation: null }
    }

    if (imageValidation && imageValidation.usable === false) {
      if (imageValidation.reason === 'transient') {
        // Network/HTTP condition that tells us nothing deterministic about the resource
        // itself (timeout, 429, 5xx after retries). Never fabricate IMAGE_INVALID from
        // this -- treat it the same as any other "can't auto-decide" case.
        return { classification: CLASSIFICATIONS.AMBIGUOUS, candidate: row, match: candidate.match, imageValidation }
      }
      // Deterministic proof the extracted URL is not a usable image: 404/410, 403/401
      // (blocked/WAF), or a 2xx response that isn't actually an image.
      return { classification: CLASSIFICATIONS.IMAGE_INVALID, candidate: row, match: candidate.match, imageValidation }
    }
  }

  const nameChanged = row.name && discovered.name && normalize(row.name) !== normalize(discovered.name)
  const numberChanged = row.card_number && discovered.cardNumber && row.card_number !== discovered.cardNumber
  const imageChanged = Boolean(
    row.image_url_hi && imageInfo?.image_url_hi && row.image_url_hi !== imageInfo.image_url_hi
  )

  if (nameChanged || numberChanged || imageChanged) {
    return { classification: CLASSIFICATIONS.CHANGED, candidate: row, match: candidate.match, imageValidation }
  }

  return { classification: CLASSIFICATIONS.UNCHANGED, candidate: row, match: candidate.match, imageValidation }
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[\s\-_]/g, '')
}
