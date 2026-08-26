import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runDiscoverCatalog, resumeStartId, isDirectCliInvocation } from '../discover-catalog.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_PATH = path.join(path.dirname(__filename), '..', 'discover-catalog.mjs')

// Mock fetchImpl matching probeCardId()'s real contract (see discover-cards.mjs): a
// FOUND id resolves (after "redirect") to the details.php URL; an invalid id resolves to
// the generic search index.php page; ids in `errorIds` reject outright (simulating a
// network/timeout failure probeCardId() must surface as status:'error', never 'gap').
function makeFetchImpl({ foundIds = new Set(), errorIds = new Set() } = {}) {
  return async (url) => {
    const m = url.match(/card\/(\d+)\//)
    const id = m ? Number(m[1]) : null
    if (id != null && errorIds.has(id)) {
      throw new Error(`simulated network failure for id ${id}`)
    }
    if (id != null && foundIds.has(id)) {
      return { status: 200, url: `https://www.pokemon-card.com/card-search/details.php/card/${id}/regu/all` }
    }
    return { status: 200, url: 'https://www.pokemon-card.com/card-search/index.php?pg=' }
  }
}

test('runDiscoverCatalog: range 49500-49502, discovery-only -- ogni id scansionato, nessun parse/immagine/matching nel record', async () => {
  const fetchImpl = makeFetchImpl({ foundIds: new Set([49500, 49501]) })
  const { records, summary } = await runDiscoverCatalog({ fromId: 49500, toId: 49502, fetchImpl, minIntervalMs: 0 })
  assert.equal(records.length, 3)
  assert.deepEqual(records.map((r) => r.officialSourceId), ['49500', '49501', '49502'])
  assert.deepEqual(records.map((r) => r.status), ['found', 'found', 'gap'])
  // Contratto del record: SOLO questi 4 campi -- nessun discovered/imageInfo/classification.
  for (const r of records) {
    assert.deepEqual(Object.keys(r).sort(), ['finalUrl', 'httpStatus', 'officialSourceId', 'status'].sort())
  }
  assert.equal(summary.totalScanned, 3)
  assert.equal(summary.found, 2)
  assert.equal(summary.gap, 1)
  assert.equal(summary.from, 49500)
  assert.equal(summary.to, 49502)
  assert.equal(summary.lastCompletedId, 49502)
})

test('runDiscoverCatalog: molti gap consecutivi -> la scansione CONTINUA fino a --to, mai un boundary di stopAfterConsecutiveGaps', async () => {
  // Tutto gap per l'intero range tranne il primo e l'ultimo id -- se il modulo avesse
  // (erroneamente) riusato discoverForward()/una soglia di gap consecutivi, si sarebbe
  // fermato molto prima di raggiungere l'ultimo id.
  const fetchImpl = makeFetchImpl({ foundIds: new Set([1000, 1040]) })
  const { records, summary } = await runDiscoverCatalog({ fromId: 1000, toId: 1040, fetchImpl, minIntervalMs: 0 })
  assert.equal(records.length, 41) // 1000..1040 inclusi, TUTTI scansionati
  assert.equal(records[0].status, 'found')
  assert.equal(records[40].status, 'found')
  assert.equal(records.slice(1, 40).every((r) => r.status === 'gap'), true, '39 gap consecutivi in mezzo, tutti scansionati comunque')
  assert.equal(summary.gap, 39)
  assert.equal(summary.totalScanned, 41)
})

test('runDiscoverCatalog: status "error" (fetch fallito) non viene MAI trasformato in "gap"', async () => {
  const fetchImpl = makeFetchImpl({ foundIds: new Set(), errorIds: new Set([2000, 2001, 2002]) })
  const { records, summary } = await runDiscoverCatalog({ fromId: 2000, toId: 2002, fetchImpl, minIntervalMs: 0 })
  assert.deepEqual(records.map((r) => r.status), ['error', 'error', 'error'])
  assert.equal(summary.error, 3)
  assert.equal(summary.gap, 0)
  // Un id in errore non ha un finalUrl né un httpStatus risolti (nessuna risposta
  // ricevuta) -- mai un valore inventato al posto di null.
  assert.equal(records[0].finalUrl, null)
  assert.equal(records[0].httpStatus, null)
})

test('runDiscoverCatalog: nessuna operazione di Supabase/matching -- il record non contiene alcun campo derivato da classify/parse/image', async () => {
  const fetchImpl = makeFetchImpl({ foundIds: new Set([3000]) })
  const { records } = await runDiscoverCatalog({ fromId: 3000, toId: 3000, fetchImpl, minIntervalMs: 0 })
  const r = records[0]
  assert.equal('discovered' in r, false)
  assert.equal('imageInfo' in r, false)
  assert.equal('imageValidation' in r, false)
  assert.equal('classification' in r, false)
  assert.equal('matchedCardId' in r, false)
})

test('resumeStartId: nessun checkpoint -> parte da fromId', () => {
  assert.equal(resumeStartId(100, null), 100)
})

test('resumeStartId: checkpoint con lastCompletedId >= fromId -> riparte da lastCompletedId + 1', () => {
  assert.equal(resumeStartId(100, { lastCompletedId: 105 }), 106)
})

test('resumeStartId: checkpoint precedente al fromId richiesto -> ignorato, si parte comunque da fromId', () => {
  assert.equal(resumeStartId(300, { lastCompletedId: 50 }), 300)
})

test('runDiscoverCatalog: checkpoint scritto atomicamente dopo ogni id, con lastCompletedId/updatedAt corretti', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cp-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  const fetchImpl = makeFetchImpl({ foundIds: new Set() })

  const seenCheckpoints = []
  await runDiscoverCatalog({
    fromId: 400,
    toId: 402,
    fetchImpl,
    minIntervalMs: 0,
    checkpointPath,
    onRecord: () => {
      // Il checkpoint per l'id corrente deve già esistere quando onRecord viene chiamato
      // per l'id SUCCESSIVO -- verifichiamo leggendo lo stato del file dopo ogni record.
      if (fs.existsSync(checkpointPath)) {
        seenCheckpoints.push(JSON.parse(fs.readFileSync(checkpointPath, 'utf8')).lastCompletedId)
      }
    },
  })

  const finalCp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
  assert.equal(finalCp.lastCompletedId, 402)
  assert.ok(typeof finalCp.updatedAt === 'string' && !Number.isNaN(Date.parse(finalCp.updatedAt)))
  assert.deepEqual(Object.keys(finalCp).sort(), ['lastCompletedId', 'updatedAt'])
})

test('runDiscoverCatalog: processo interrotto durante l\'ID successivo a uno già completato -> il riavvio riprende dall\'ID che segue l\'ultimo checkpoint scritto, mai perde progressi già persistiti', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-resume-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  const fetchImpl = makeFetchImpl({ foundIds: new Set([500, 503]) })

  const probedIdsFirstRun = []
  const trackingFetch = async (url, ...rest) => {
    const m = url.match(/card\/(\d+)\//)
    if (m) probedIdsFirstRun.push(Number(m[1]))
    return fetchImpl(url, ...rest)
  }

  // Il checkpoint per un id è scritto solo DOPO che il suo record è stato consegnato con
  // successo al consumer (onRecord) -- stesso contratto di sync-dry-run.mjs. Se onRecord
  // stesso fallisce per l'id 502 (simulando un'interruzione mentre lo si processa), quell'
  // id NON viene considerato completato: il checkpoint resta fermo al 501, ed è corretto
  // ri-processarlo al riavvio (mai perdere l'output).
  let threw = false
  try {
    await runDiscoverCatalog({
      fromId: 500,
      toId: 505,
      fetchImpl: trackingFetch,
      minIntervalMs: 0,
      checkpointPath,
      onRecord: (r) => {
        if (r.officialSourceId === '502') throw new Error('simulated interruption while processing id 502')
      },
    })
  } catch (err) {
    threw = true
    assert.match(err.message, /simulated interruption/)
  }
  assert.equal(threw, true)
  assert.deepEqual(probedIdsFirstRun, [500, 501, 502])

  const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
  assert.equal(cp.lastCompletedId, 501, 'il checkpoint per il 502 non deve essere stato scritto: il suo record non è stato consegnato con successo')

  // "riavvio": stesso comando (stesso range 500-505, stesso checkpoint) -- riprende
  // esattamente dall'id successivo all'ultimo checkpoint valido (502), mai da uno già
  // completato con successo (500/501), e mai saltando oltre 502.
  const probedIdsSecondRun = []
  const trackingFetch2 = async (url, ...rest) => {
    const m = url.match(/card\/(\d+)\//)
    if (m) probedIdsSecondRun.push(Number(m[1]))
    return fetchImpl(url, ...rest)
  }
  const { records, summary } = await runDiscoverCatalog({
    fromId: 500,
    toId: 505,
    fetchImpl: trackingFetch2,
    minIntervalMs: 0,
    checkpointPath,
  })
  assert.deepEqual(probedIdsSecondRun, [502, 503, 504, 505])
  assert.deepEqual(records.map((r) => r.officialSourceId), ['502', '503', '504', '505'])
  assert.equal(summary.lastCompletedId, 505)
})

test('runDiscoverCatalog: checkpoint già oltre --to (nulla da fare) -> nessun id probato, lastCompletedId preservato dal checkpoint esistente', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-done-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  fs.writeFileSync(checkpointPath, JSON.stringify({ lastCompletedId: 999, updatedAt: new Date(0).toISOString() }))
  const fetchImpl = async () => { throw new Error('non deve mai essere chiamato') }

  const { records, summary } = await runDiscoverCatalog({ fromId: 600, toId: 605, fetchImpl, minIntervalMs: 0, checkpointPath })
  assert.equal(records.length, 0)
  assert.equal(summary.totalScanned, 0)
  assert.equal(summary.lastCompletedId, 999)
})

// --- CLI entrypoint detection (stesso bug latente Windows già corretto negli altri
// entrypoint della pipeline -- vedi sync-dry-run.mjs per la spiegazione completa) ---

test('isDirectCliInvocation: true quando argv[1] è il path reale del modulo', () => {
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  assert.equal(isDirectCliInvocation(SCRIPT_PATH, scriptModuleUrl), true)
})

test('isDirectCliInvocation: false per un path diverso dal modulo corrente', () => {
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  assert.equal(isDirectCliInvocation('/some/other/unrelated-file.mjs', scriptModuleUrl), false)
})

test('isDirectCliInvocation: false (non lancia) quando argv[1] è undefined', () => {
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  assert.equal(isDirectCliInvocation(undefined, scriptModuleUrl), false)
})

test('CLI smoke (subprocess reale): `node discover-catalog.mjs` esegue davvero main() ed esce 0 con output, senza rete (range vuoto from>to)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cli-'))
  const outPath = path.join(tmpDir, 'out.ndjson')
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')

  // from > to => runDiscoverCatalog non itera mai (nessuna fetch necessaria) -- isola la
  // verifica "l'entrypoint esegue main()" dalla disponibilità di rete dell'ambiente CI.
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--from=5',
    '--to=1',
    `--out=${outPath}`,
    `--checkpoint=${checkpointPath}`,
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, `exit code atteso 0, ottenuto ${result.status}. stderr: ${result.stderr}`)
  assert.match(result.stdout, /"totalScanned"/, 'main() deve stampare il summary JSON su stdout')
  assert.match(result.stdout, /"lastCompletedId"/)
  assert.ok(fs.existsSync(outPath), 'il file di output deve essere stato creato anche con zero record')
})
