#!/usr/bin/env node
// discover-cards.mjs
// Incremental discovery over pokemon-card.com's numeric card-id space.
//
// VERIFIED (live browser, 2026-08-17) facts this module encodes:
//  - Detail URL:  https://www.pokemon-card.com/card-search/details.php/card/{id}/regu/all
//  - An INVALID id does NOT 404. The server redirects (HTTP redirect, followed by fetch())
//    to https://www.pokemon-card.com/card-search/index.php?... (the generic search page).
//    So "not found" must be detected by inspecting the FINAL url after redirect, not the
//    HTTP status (both valid and invalid ids return 200 after redirect-following).
//  - The id space starts at 1 and the lowest ids resolve to Diamond & Pearl era cards
//    (~2007), NOT to pre-2006 legacy sets (VS/e/neo/web/PCG/ADV/etc). Those sets are
//    confirmed OUTSIDE this id space entirely -- not merely filtered out of search UI.
//    id=1 -> 基本草エネルギー (DP Entry Pack era), id=1000 -> DPBP#269 Heracross (DP era).
//  - The space is SPARSE, not dense: id=25000 is a gap, id=45000/50000 are valid,
//    id=52000/55000/60000/100000 are gaps (as of 2026-08-17). Never assume every
//    integer in [1, max] is a real card -- probe and classify each one.
//  - The id is only ROUGHLY monotonic with release date (independently corroborated by
//    the third-party 1ulce/pokemon-card-data dataset, whose own docs describe using
//    "smallest pokemon_card_id" as a same-set tie-break fallback specifically because
//    it is "roughly the order cards were registered on pokemon-card.com" -- not a
//    guaranteed strict ordering). Treat it as a discovery aid, not a release-date oracle.
//  - Current high-water mark as of 2026-08-17: between 50,000 (valid) and 52,000 (gap).
//    This WILL change over time; discover-cards.mjs tracks it via a local checkpoint,
//    it is never hardcoded into ingestion logic.

import { pathToFileURL } from 'node:url'
import { fetchWithRetry, createRateLimiter } from './lib/http.mjs'

export function classifyProbeResult(finalUrl) {
  if (!finalUrl) return 'error'
  if (/\/card-search\/details\.php\/card\/\d+\//.test(finalUrl)) return 'found'
  if (/\/card-search\/index\.php/.test(finalUrl)) return 'gap'
  // Verified live (2026-08-17), id=676: pokemon-card.com also falls back to the bare
  // /card-search/ listing page (no index.php) for some invalid ids -- same "not found"
  // meaning as the index.php fallback, just a different redirect target. Match it as
  // /card-search/ followed by end-of-string or a query string, so it doesn't also swallow
  // /card-search/details.php/... (already handled above) or other /card-search/<other>.php.
  if (/\/card-search\/(?:\?|$)/.test(finalUrl)) return 'gap'
  return 'unknown'
}

export async function probeCardId(id, opts = {}) {
  const { fetchImpl = fetch, limiter = null, baseUrl = 'https://www.pokemon-card.com' } = opts
  const url = `${baseUrl}/card-search/details.php/card/${id}/regu/all`
  try {
    const res = await fetchWithRetry(url, { fetchImpl, limiter })
    const finalUrl = res.url || url
    const status = classifyProbeResult(finalUrl)
    return { id, url, finalUrl, status, httpStatus: res.status }
  } catch (err) {
    return { id, url, finalUrl: null, status: 'error', error: String(err && err.message || err) }
  }
}

// discoverForward: probe id = fromId, fromId+1, ... until `stopAfterConsecutiveGaps`
// consecutive gaps are seen (boundary reached), or `hardLimit` ids have been probed
// (safety cap so a bug can never runaway-scan the whole space in one job run).
export async function discoverForward(fromId, opts = {}) {
  const {
    fetchImpl = fetch,
    limiter = null,
    stopAfterConsecutiveGaps = 25,
    hardLimit = 2000,
    onResult = null,
  } = opts

  const found = []
  const gaps = []
  let consecutiveGaps = 0
  let id = fromId
  let probed = 0

  while (consecutiveGaps < stopAfterConsecutiveGaps && probed < hardLimit) {
    const r = await probeCardId(id, { fetchImpl, limiter })
    probed++
    if (onResult) onResult(r)
    if (r.status === 'found') {
      found.push(r)
      consecutiveGaps = 0
    } else if (r.status === 'gap') {
      gaps.push(r)
      consecutiveGaps++
    } else {
      // transient/error: don't count toward the boundary, but don't loop forever either
      gaps.push(r)
      consecutiveGaps++
    }
    id++
  }

  return {
    found,
    gapsProbed: gaps.length,
    idsProbed: probed,
    newHighWaterMark: found.length ? found[found.length - 1].id : null,
    boundaryReached: consecutiveGaps >= stopAfterConsecutiveGaps,
  }
}

// --- CLI (dry-run by default; only prints/writes local JSON, no DB writes) ---
async function main() {
  const args = process.argv.slice(2)
  const fromArg = args.find((a) => a.startsWith('--from='))
  const fromId = fromArg ? Number(fromArg.split('=')[1]) : 1
  const limiter = createRateLimiter({ minIntervalMs: 1000 })
  console.error(`[discover-cards] dry-run: probing forward from id=${fromId}, 1 req/sec, stop after 25 consecutive gaps`)
  const result = await discoverForward(fromId, {
    limiter,
    onResult: (r) => console.error(`  id=${r.id} -> ${r.status}${r.status === 'found' ? '' : ''}`),
  })
  console.log(JSON.stringify(result, null, 2))
}

// CLI entrypoint detection: see sync-dry-run.mjs's isDirectCliInvocation() header comment
// for the full rationale. The naive `import.meta.url === \`file://${process.argv[1]}\``
// check is Windows-broken (import.meta.url is a well-formed file:// URL, process.argv[1]
// on Windows is a raw backslash path) -- this module had the same latent bug, fixed the
// same way here for consistency, since it is in scope for this pass.
export function isDirectCliInvocation(argv1, moduleUrl) {
  if (!argv1) return false
  return pathToFileURL(argv1).href === moduleUrl
}

if (isDirectCliInvocation(process.argv[1], import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
