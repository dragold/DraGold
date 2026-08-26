#!/usr/bin/env node
// sync-dry-run.mjs
// Orchestrates discover -> fetch -> parse -> extract-image -> validate-image -> classify,
// end to end, DRY-RUN ONLY. Never writes to Supabase. Writes local NDJSON + a JSON
// summary only.
//
// Usage:
//   node sync-dry-run.mjs --from=42000 --to=42010 --db-dump=data/cards-ja.ndjson
//
// Resumability: writes a checkpoint file (data/checkpoint.json) after every id -- and
// only after that id's record has actually been produced (pushed to `records`, counted,
// and handed to onRecord) -- so a killed/restarted run continues from the last completed
// id instead of re-probing from scratch. The write itself is atomic (write to a temp
// file, then rename) so a process killed mid-write can never leave a corrupt/partial
// checkpoint behind.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fetchWithRetry, createRateLimiter } from './lib/http.mjs'
import { probeCardId } from './discover-cards.mjs'
import { htmlToText, parseCardText } from './parse-card.mjs'
import { extractPrimaryImage } from './extract-image.mjs'
import { validateImageUrl } from './validate-image.mjs'
import { classifyDiscovered } from './classify.mjs'

// writeCheckpointAtomic: write-to-temp + rename so an interruption can never observe (or
// leave behind) a half-written checkpoint file. rename() is atomic on the same
// filesystem/volume, which a checkpoint file living next to its own directory always is.
function writeCheckpointAtomic(checkpointPath, data) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true })
  const tmpPath = `${checkpointPath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, checkpointPath)
}

export async function runSyncDryRun({
  fromId,
  toId,
  dbRows = [],
  fetchImpl = fetch,
  minIntervalMs = 1000,
  checkpointPath = null,
  onRecord = null,
  validateImageImpl = validateImageUrl,
} = {}) {
  const limiter = createRateLimiter({ minIntervalMs })
  const records = []
  const counts = {}

  let start = fromId
  if (checkpointPath && fs.existsSync(checkpointPath)) {
    const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
    if (cp.lastCompletedId != null && cp.lastCompletedId >= fromId) start = cp.lastCompletedId + 1
  }

  for (let id = start; id <= toId; id++) {
    const probe = await probeCardId(id, { fetchImpl, limiter })
    let discovered = { found: false }
    let imageInfo = null
    let imageValidation = null

    if (probe.status === 'found') {
      const res = await fetchWithRetry(probe.finalUrl, { fetchImpl, limiter })
      const html = await res.text()
      const text = htmlToText(html)
      discovered = parseCardText(text, { id })
      imageInfo = extractPrimaryImage(html)

      // Real HTTP validation, only when an image URL was actually extracted -- there is
      // nothing to validate otherwise (that case is IMAGE_MISSING, decided purely by
      // extraction, see classify.mjs). Reuses the same rate limiter as the page fetch so
      // we stay gentle on the source host, per lib/http.mjs's existing policy.
      const urlToValidate = imageInfo?.image_url_hi || imageInfo?.image_url || null
      if (urlToValidate) {
        const rateLimitedFetch = async (...args) => {
          if (limiter) await limiter()
          return fetchImpl(...args)
        }
        imageValidation = await validateImageImpl(urlToValidate, { fetchImpl: rateLimitedFetch })
      }
    }

    const { classification, candidate, match } = classifyDiscovered(discovered, dbRows, imageInfo, { imageValidation })

    const record = {
      officialSourceId: String(id),
      probeStatus: probe.status,
      discovered,
      imageInfo,
      imageValidation,
      classification,
      matchedCardId: candidate ? candidate.id : null,
      matchGrade: match ? match.grade : null,
    }
    records.push(record)
    counts[classification] = (counts[classification] || 0) + 1
    if (onRecord) onRecord(record)

    // Written only now -- after this id's record has been fully produced above -- and
    // atomically, so an interruption right after this line still leaves a checkpoint that
    // correctly resumes from id+1, never from a half-processed id.
    if (checkpointPath) {
      writeCheckpointAtomic(checkpointPath, { lastCompletedId: id, updatedAt: new Date().toISOString() })
    }
  }

  return { records, counts, range: { fromId, toId } }
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
  const dbDumpPath = args['db-dump'] || null
  const checkpointPath = args.checkpoint || 'data/checkpoint.json'
  const outPath = args.out || 'data/sync-dry-run-results.ndjson'

  const dbRows = dbDumpPath && fs.existsSync(dbDumpPath)
    ? fs.readFileSync(dbDumpPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []

  console.error(`[sync-dry-run] DRY RUN. range=[${fromId},${toId}] dbRows=${dbRows.length} (no Supabase writes will occur)`)

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const outStream = fs.createWriteStream(outPath, { flags: 'w' })

  const { counts } = await runSyncDryRun({
    fromId,
    toId,
    dbRows,
    checkpointPath,
    onRecord: (r) => {
      outStream.write(JSON.stringify(r) + '\n')
      console.error(`  id=${r.officialSourceId} probe=${r.probeStatus} -> ${r.classification}`)
    },
  })
  outStream.end()

  console.log(JSON.stringify({ counts, outPath, checkpointPath }, null, 2))
}

// CLI entrypoint detection.
//
// The naive `import.meta.url === \`file://${process.argv[1]}\`` check is Windows-broken:
// import.meta.url is always a well-formed file:// URL (e.g.
// 'file:///C:/Projects/DraGold/scripts/sources/pokemon-jp/sync-dry-run.mjs', with forward
// slashes and a leading slash before the drive letter), while process.argv[1] on Windows is
// a raw filesystem path using backslashes (e.g. 'C:\\Projects\\DraGold\\scripts\\...\\sync-
// dry-run.mjs'). Naively prefixing 'file://' onto a backslash path never equals the real
// file:// URL, so the comparison silently fails on Windows -- main() is never called, the
// process exits 0 with no output, and nothing is written. This is exactly the bug reported
// against the real Windows repo. node:url's pathToFileURL() performs the correct path ->
// file URL conversion for the current platform (backslash-to-slash, drive-letter handling,
// percent-encoding) and is the documented/idiomatic way to implement this check portably.
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
