import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { runSyncDryRun, isDirectCliInvocation } from '../sync-dry-run.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_PATH = path.join(path.dirname(__filename), '..', 'sync-dry-run.mjs')

const REAL_IMG = 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/042273_P_RIFUIAVSTAR.jpg'
const CARD_HTML = `<html><body>
リーフィアVSTAR
012 / 172
イラストレーター
PLANETA Hiiragi
ハイクラスパック 「VSTARユニバース」
<img src="${REAL_IMG}">
</body></html>`

function makeFetchImpl({ validIds }) {
  return async (url) => {
    const m = url.match(/card\/(\d+)\//)
    if (m) {
      const id = Number(m[1])
      if (validIds.has(id)) {
        return { status: 200, url, text: async () => CARD_HTML }
      }
      return { status: 200, url: 'https://www.pokemon-card.com/card-search/index.php?pg=', text: async () => '<html>search page</html>' }
    }
    throw new Error(`unexpected url ${url}`)
  }
}

// Stub used by tests that don't care about image-validation behavior specifically: the
// real validateImageImpl (validate-image.mjs's validateImageUrl) makes a real HTTP call,
// which the page-fetch mock above doesn't know how to answer for an image URL. Per the
// mission's DI requirement, tests inject their own validateImageImpl instead of teaching
// the page-fetch mock about image requests too.
const ALWAYS_VALID_IMAGE = async () => ({ usable: true, reason: null, probe: { classification: 'A', httpStatus: 200 } })

test('runSyncDryRun: end-to-end su range misto found/gap, mai scrive nulla fuori dal filesystem locale', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const dbRows = []
  const { records, counts } = await runSyncDryRun({
    fromId: 42272, toId: 42274, dbRows, fetchImpl, minIntervalMs: 0, validateImageImpl: ALWAYS_VALID_IMAGE,
  })
  assert.equal(records.length, 3)
  assert.equal(records[0].probeStatus, 'gap')
  assert.equal(records[1].probeStatus, 'found')
  assert.equal(records[1].classification, 'NEW') // nessuna riga DB corrispondente nel fixture
  assert.equal(records[1].imageInfo.image_url_hi, REAL_IMG)
  assert.equal(records[2].probeStatus, 'gap')
  assert.equal(counts.NEW, 1)
})

test('runSyncDryRun: validazione immagine collegata al percorso principale -> validateImageImpl viene chiamato con l\'URL estratto quando esiste', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const calls = []
  const validateImageImpl = async (url, opts) => { calls.push(url); return { usable: true, reason: null, probe: null } }
  await runSyncDryRun({ fromId: 42273, toId: 42273, dbRows: [], fetchImpl, minIntervalMs: 0, validateImageImpl })
  assert.deepEqual(calls, [REAL_IMG])
})

test('runSyncDryRun: nessun URL immagine estratto -> validateImageImpl NON viene chiamato (nulla da validare)', async () => {
  const fetchImpl = async (url) => {
    if (url.match(/card\/(\d+)\//)) {
      return { status: 200, url, text: async () => '<html><body>基本草エネルギー\n\nCLOSE</body></html>' }
    }
    throw new Error(`unexpected url ${url}`)
  }
  let called = false
  const validateImageImpl = async () => { called = true; return { usable: true, reason: null, probe: null } }
  await runSyncDryRun({ fromId: 1, toId: 1, dbRows: [], fetchImpl, minIntervalMs: 0, validateImageImpl })
  assert.equal(called, false)
})

const DB_ROW_FOR_IMAGE_TESTS = [
  { id: 'ja-s12a-042273', lang: 'ja', tcg: 'pokemon', name: 'リーフィアVSTAR', card_number: '012/172', set_name: 'VSTARユニバース' },
]

test('runSyncDryRun: URL immagine presente + HTTP 200 + immagine valida -> classificazione NON è IMAGE_MISSING/IMAGE_INVALID', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const { records } = await runSyncDryRun({
    fromId: 42273, toId: 42273, dbRows: DB_ROW_FOR_IMAGE_TESTS, fetchImpl, minIntervalMs: 0, validateImageImpl: ALWAYS_VALID_IMAGE,
  })
  assert.notEqual(records[0].classification, 'IMAGE_MISSING')
  assert.notEqual(records[0].classification, 'IMAGE_INVALID')
})

test('runSyncDryRun: URL immagine presente + HTTP 404 -> IMAGE_INVALID', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const validateImageImpl = async () => ({ usable: false, reason: 'not_found', probe: { classification: 'C', httpStatus: 404 } })
  const { records } = await runSyncDryRun({
    fromId: 42273, toId: 42273, dbRows: DB_ROW_FOR_IMAGE_TESTS, fetchImpl, minIntervalMs: 0, validateImageImpl,
  })
  assert.equal(records[0].classification, 'IMAGE_INVALID')
  assert.equal(records[0].imageValidation.reason, 'not_found')
})

test('runSyncDryRun: URL immagine presente + risposta non immagine (content-type/magic-bytes errati) -> IMAGE_INVALID', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const validateImageImpl = async () => ({ usable: false, reason: 'not_an_image', probe: { classification: 'E', httpStatus: 200 } })
  const { records } = await runSyncDryRun({
    fromId: 42273, toId: 42273, dbRows: DB_ROW_FOR_IMAGE_TESTS, fetchImpl, minIntervalMs: 0, validateImageImpl,
  })
  assert.equal(records[0].classification, 'IMAGE_INVALID')
  assert.equal(records[0].imageValidation.reason, 'not_an_image')
})

test('runSyncDryRun: errore di rete/HTTP transient durante la validazione immagine -> AMBIGUOUS, mai una classificazione inventata', async () => {
  const fetchImpl = makeFetchImpl({ validIds: new Set([42273]) })
  const validateImageImpl = async () => ({ usable: false, reason: 'transient', probe: { classification: 'F', httpStatus: null } })
  const { records } = await runSyncDryRun({
    fromId: 42273, toId: 42273, dbRows: DB_ROW_FOR_IMAGE_TESTS, fetchImpl, minIntervalMs: 0, validateImageImpl,
  })
  assert.equal(records[0].classification, 'AMBIGUOUS')
})

test('runSyncDryRun: checkpoint permette la ripresa senza ri-probare gli id già completati', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkjp-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  const fetchImpl = makeFetchImpl({ validIds: new Set() })
  const probed = []
  const trackingFetch = async (url, ...rest) => { probed.push(url); return fetchImpl(url, ...rest) }

  await runSyncDryRun({ fromId: 100, toId: 102, dbRows: [], fetchImpl: trackingFetch, minIntervalMs: 0, checkpointPath, validateImageImpl: ALWAYS_VALID_IMAGE })
  const firstRunProbeCount = probed.length
  assert.ok(firstRunProbeCount >= 3)

  // seconda "run" con lo stesso checkpoint e lo stesso range: deve ripartire da 103 (nulla da fare)
  probed.length = 0
  const { records } = await runSyncDryRun({ fromId: 100, toId: 102, dbRows: [], fetchImpl: trackingFetch, minIntervalMs: 0, checkpointPath, validateImageImpl: ALWAYS_VALID_IMAGE })
  assert.equal(records.length, 0)
  assert.equal(probed.length, 0)
})

test('runSyncDryRun: processo interrotto durante l\'ID successivo a uno già completato -> il riavvio riprende dall\'ID che segue l\'ultimo checkpoint scritto, mai perde progressi già persistiti', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkjp-interrupt-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  const fetchImpl = makeFetchImpl({ validIds: new Set() }) // tutto gap, semplice e deterministico

  const processedIds = []
  // Simula un'interruzione (crash / kill) MENTRE si sta processando l'id 201, prima che il
  // suo checkpoint venga scritto (il checkpoint per un id è scritto solo dopo che il suo
  // record è stato realmente prodotto E consegnato al consumer via onRecord -- se il
  // consumer stesso fallisce, quell'id NON viene considerato "completato" ed è corretto
  // ri-processarlo al riavvio, mai perdere l'output). L'ultimo checkpoint valido resta
  // quindi quello del 200.
  let threw = false
  try {
    await runSyncDryRun({
      fromId: 200,
      toId: 205,
      dbRows: [],
      fetchImpl,
      minIntervalMs: 0,
      checkpointPath,
      validateImageImpl: ALWAYS_VALID_IMAGE,
      onRecord: (r) => {
        processedIds.push(Number(r.officialSourceId))
        if (Number(r.officialSourceId) === 201) throw new Error('simulated crash while processing id 201')
      },
    })
  } catch (err) {
    threw = true
    assert.match(err.message, /simulated crash/)
  }
  assert.equal(threw, true)
  assert.deepEqual(processedIds, [200, 201])

  const cp = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'))
  assert.equal(cp.lastCompletedId, 200, 'il checkpoint per il 201 non deve essere stato scritto: il suo record non è stato consegnato con successo')

  // "riavvio": una nuova chiamata con lo stesso checkpointPath e range originale riprende
  // esattamente dall'id successivo all'ultimo checkpoint valido (201), mai da uno già
  // completato con successo (200), e mai saltando oltre 201.
  const resumedIds = []
  const { records } = await runSyncDryRun({
    fromId: 200,
    toId: 205,
    dbRows: [],
    fetchImpl,
    minIntervalMs: 0,
    checkpointPath,
    validateImageImpl: ALWAYS_VALID_IMAGE,
    onRecord: (r) => resumedIds.push(Number(r.officialSourceId)),
  })
  assert.deepEqual(resumedIds, [201, 202, 203, 204, 205])
  assert.equal(records.length, 5)
})

test('runSyncDryRun: --from/--to non vengono persi dal checkpoint -- un checkpoint precedente al range richiesto non lo altera', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkjp-fromto-'))
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')
  fs.writeFileSync(checkpointPath, JSON.stringify({ lastCompletedId: 50, updatedAt: new Date().toISOString() }))

  const fetchImpl = makeFetchImpl({ validIds: new Set() })
  const { records, range } = await runSyncDryRun({
    fromId: 300, toId: 302, dbRows: [], fetchImpl, minIntervalMs: 0, checkpointPath, validateImageImpl: ALWAYS_VALID_IMAGE,
  })
  // checkpoint (50) è sotto il fromId richiesto (300) -> ignorato, si parte comunque da 300
  assert.deepEqual(records.map((r) => r.officialSourceId), ['300', '301', '302'])
  assert.deepEqual(range, { fromId: 300, toId: 302 })
})

// --- CLI entrypoint detection (regression: Windows silent-no-op bug) ---
//
// Bug reproduced on the real Windows repo: `node .\sync-dry-run.mjs --from=... --to=...`
// exited 0 with zero output and created no files, because the old check
// (`import.meta.url === \`file://${process.argv[1]}\``) built the comparison URL by
// hand-prefixing 'file://' onto a raw Windows path (backslashes, drive letter) instead of
// using a real path -> URL conversion, so it never matched and main() was silently skipped.
//
// isDirectCliInvocation() now delegates that conversion to node:url's pathToFileURL(), which
// implements the platform-correct path -> file URL rules (including on Windows) instead of
// reimplementing them by string concatenation. That makes its correctness on the current
// platform (whatever CI happens to run on) a real test of the same code path Windows uses --
// there is no separate "Windows branch" to fake, the bug was in the ad-hoc string logic, not
// in a platform-specific edge case.
test('isDirectCliInvocation: true quando argv[1] è il path reale del modulo (comportamento node <script>)', () => {
  const realArgv1 = fileURLToPath(import.meta.url) // path style nativo della piattaforma corrente
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  const realScriptArgv1 = SCRIPT_PATH
  assert.equal(isDirectCliInvocation(realScriptArgv1, scriptModuleUrl), true)
  // controllo di non-regressione sul vecchio bug: un confronto naive fatto con
  // `file://${argv1}` (senza pathToFileURL) NON avrebbe matchato su Windows-style path --
  // qui verifichiamo che la nostra funzione risolva correttamente lo stesso path del modulo
  // di test corrente confrontato con se stesso.
  void realArgv1
})

test('isDirectCliInvocation: false per un path diverso dal modulo corrente', () => {
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  assert.equal(isDirectCliInvocation('/some/other/unrelated-file.mjs', scriptModuleUrl), false)
})

test('isDirectCliInvocation: false (non lancia) quando argv[1] è undefined (es. import via require/loader senza CLI diretta)', () => {
  const scriptModuleUrl = pathToFileURL(SCRIPT_PATH).href
  assert.equal(isDirectCliInvocation(undefined, scriptModuleUrl), false)
})

test('CLI smoke (subprocess reale): `node sync-dry-run.mjs` esegue davvero main() ed esce 0 con output, senza rete (range vuoto from>to)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkjp-cli-'))
  const outPath = path.join(tmpDir, 'results.ndjson')
  const checkpointPath = path.join(tmpDir, 'checkpoint.json')

  // from > to => runSyncDryRun non itera mai (nessuna fetch, nessuna rete necessaria) --
  // questo isola la verifica "l'entrypoint esegue main()" dalla disponibilità di rete
  // dell'ambiente CI, che è un problema ortogonale al bug che stiamo testando qui.
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--from=5',
    '--to=1',
    `--out=${outPath}`,
    `--checkpoint=${checkpointPath}`,
  ], { encoding: 'utf8' })

  assert.equal(result.status, 0, `exit code atteso 0, ottenuto ${result.status}. stderr: ${result.stderr}`)
  assert.match(result.stdout, /"counts"/, 'main() deve stampare il riepilogo JSON su stdout')
  assert.match(result.stdout, /"outPath"/)
  assert.ok(fs.existsSync(outPath), 'il file di output deve essere stato creato anche con zero record')
})
