#!/usr/bin/env node
// discover-catalog.mjs
// Discovery-ONLY scan over pokemon-card.com's numeric card-id space.
//
// Deliberately narrower than discover-cards.mjs's discoverForward()/sync-dry-run.mjs's
// full pipeline: this module does ONLY probeCardId() -- no fetch-and-parse of the card
// page, no image extraction, no image HTTP validation, no DB matching/classification, no
// Supabase writes of any kind. It exists to build a raw, resumable id->status catalog of
// the source's id space that later stages (parse/classify) can consume, without paying
// the cost of fetching/parsing every page just to find out an id is a gap.
//
// Unlike discoverForward() (which stops after N consecutive gaps as a boundary heuristic),
// this scan has exactly ONE termination condition: the requested --from/--to range. It
// never stops early on consecutive gaps -- the id space is known to be sparse (see
// discover-cards.mjs's header notes), and a caller asking for a specific range wants that
// whole range scanned, gaps included, not an early exit.
//
// Usage:
//   node discover-catalog.mjs --from=49500 --to=49520 \
//     --out=data/discover-catalog.ndjson --checkpoint=data/discover-catalog-checkpoint.json
//
// Resumability: writes a checkpoint file after every id -- and only after that id's
// record has actually been produced -- so a killed/restarted run continues from the last
// completed id instead of re-probing from scratch. The write itself is atomic (write to a
// temp file, then rename), same pattern as sync-dry-run.mjs's writeCheckpointAtomic().

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRateLimiter } from './lib/http.mjs'
import { probeCardId } from './discover-cards.mjs'

// writeCheckpointAtomic: write-to-temp + rename so an interruption can never observe (or
// leave behind) a half-written checkpoint file. Same pattern as sync-dry-run.mjs.
function writeCheckpointAtomic(checkpointPath, data) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true })
  const tmpPath = `${checkpointPath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, checkpointPath)
}

function readCheckpoint(checkpointPath) {
  if (!checkpointPath || !fs.existsSync(checkpointPath)) return null
  try {
    return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
  } catch {
    // A corrupt/partial checkpoint (should not happen given the atomic write, but a
    // human could have hand-edited it) is treated as "no checkpoint" -- never crash the
    // scan over a bad checkpoint file, and never guess at a partial value.
    return null
  }
}

// resumeStartId: given a requested fromId and an existing checkpoint, returns the id the
// scan should actually start at. A checkpoint only applies (and shifts the start forward)
// when its lastCompletedId falls within-or-after the requested fromId -- a checkpoint from
// an earlier/lower range never truncates a range the caller explicitly asked to (re)scan.
export function resumeStartId(fromId, checkpoint) {
  if (checkpoint && checkpoint.lastCompletedId != null && checkpoint.lastCompletedId >= fromId) {
    return checkpoint.lastCompletedId + 1
  }
  return fromId
}

const KNOWN_STATUSES = ['found', 'gap', 'error', 'unknown']

// runDiscoverCatalog: the testable core. Discovery-only (probeCardId() per id, nothing
// else), scans every id in [fromId, toId] with no early-exit on consecutive gaps, resumes
// from a checkpoint's lastCompletedId + 1 when applicable, and writes the checkpoint
// atomically after each id -- only after that id's record has actually been produced.
export async function runDiscoverCatalog({
  fromId,
  toId,
  fetchImpl = fetch,
  minIntervalMs = 1000,
  checkpointPath = null,
  onRecord = null,
} = {}) {
  const limiter = createRateLimiter({ minIntervalMs })
  const records = []
  const summary = { found: 0, gap: 0, error: 0, unknown: 0 }

  const existingCheckpoint = readCheckpoint(checkpointPath)
  const start = resumeStartId(fromId, existingCheckpoint)
  let lastCompletedId = existingCheckpoint ? existingCheckpoint.lastCompletedId ?? null : null

  for (let id = start; id <= toId; id++) {
    // Discovery-only: probeCardId() is the ENTIRE unit of work per id. No page fetch, no
    // parse, no image extraction/validation, no matching -- see the module header.
    const probe = await probeCardId(id, { fetchImpl, limiter })

    // Requirement: never coerce error/transient into "gap" -- carry probeCardId()'s own
    // status verbatim. probeCardId()'s status vocabulary is exactly found/gap/unknown
    // (via classifyProbeResult) or error (its own catch block) -- nothing remapped here.
    const record = {
      officialSourceId: String(id),
      status: probe.status,
      finalUrl: probe.finalUrl ?? null,
      httpStatus: probe.httpStatus ?? null,
    }

    records.push(record)
    if (Object.prototype.hasOwnProperty.call(summary, record.status)) {
      summary[record.status]++
    } else {
      // Safety net only: probeCardId()'s documented vocabulary is exactly the 4 keys
      // above, so this branch should be unreachable in practice.
      summary.unknown++
    }
    if (onRecord) onRecord(record)

    lastCompletedId = id
    // Written only now -- after this id's record has been fully produced above -- and
    // atomically, so an interruption right after this line still leaves a checkpoint that
    // correctly resumes from id+1, never from a half-processed id.
    if (checkpointPath) {
      writeCheckpointAtomic(checkpointPath, { lastCompletedId: id, updatedAt: new Date().toISOString() })
    }
  }

  const totalScanned = records.length
  return {
    records,
    summary: {
      totalScanned,
      found: summary.found,
      gap: summary.gap,
      error: summary.error,
      unknown: summary.unknown,
      from: fromId,
      to: toId,
      lastCompletedId,
    },
  }
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v]
    })
  )
  const fromId = Number(args.from || 1)
  const toId = Number(args.to || fromId)
  const checkpointPath = args.checkpoint || 'data/discover-catalog-checkpoint.json'
  const outPath = args.out || 'data/discover-catalog.ndjson'

  // Whether this invocation is a genuine resume (checkpoint applies to the requested
  // --from) decides how the NDJSON output is opened: append when resuming, so records
  // already written by a previous, interrupted run are preserved rather than duplicated
  // or clobbered; truncate ('w') on a fresh start of this range, since a stale checkpoint
  // that doesn't apply to this --from means this range is being (re)scanned from scratch.
  const existingCheckpoint = readCheckpoint(checkpointPath)
  const isResuming = existingCheckpoint != null && resumeStartId(fromId, existingCheckpoint) > fromId

  console.error(`[discover-catalog] DISCOVERY ONLY. range=[${fromId},${toId}] ${isResuming ? `resuming from checkpoint (lastCompletedId=${existingCheckpoint.lastCompletedId})` : 'fresh start'} (no page fetch/parse/image/matching/Supabase writes)`)

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const outStream = fs.createWriteStream(outPath, { flags: isResuming ? 'a' : 'w' })

  const { summary } = await runDiscoverCatalog({
    fromId,
    toId,
    checkpointPath,
    onRecord: (r) => {
      outStream.write(JSON.stringify(r) + '\n')
      console.error(`  id=${r.officialSourceId} -> ${r.status} (http=${r.httpStatus})`)
    },
  })
  outStream.end()

  console.log(JSON.stringify(summary, null, 2))
}

// CLI entrypoint detection: same pathToFileURL()-based check as sync-dry-run.mjs and
// discover-cards.mjs (see either's header comment for the full Windows-bug rationale).
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
