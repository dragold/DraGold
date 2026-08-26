import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { classifyProbeResult, probeCardId, discoverForward, isDirectCliInvocation } from '../discover-cards.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_PATH = path.join(path.dirname(__filename), '..', 'discover-cards.mjs')

test('classifyProbeResult: details.php url -> found; index.php url -> gap', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/details.php/card/42273/regu/all'), 'found')
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/index.php?keyword=&pg='), 'gap')
  assert.equal(classifyProbeResult(null), 'error')
  assert.equal(classifyProbeResult('https://example.com/nope'), 'unknown')
})

// Regressione: id=676, verificato dal vivo (2026-08-17). pokemon-card.com usa ANCHE
// https://www.pokemon-card.com/card-search/ (senza index.php) come fallback per id
// inesistenti -- prima del fix veniva classificato 'unknown' invece di 'gap'.
test('classifyProbeResult: fallback /card-search/ (senza index.php) -> gap', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/'), 'gap')
})

test('classifyProbeResult: /card-search/index.php (senza query string) -> gap', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/index.php'), 'gap')
})

test('classifyProbeResult: /card-search/index.php?... (con query string) -> gap', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/index.php?keyword=&pg=1'), 'gap')
})

test('classifyProbeResult: /card-search/details.php/card/676/regu/all -> found', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/card-search/details.php/card/676/regu/all'), 'found')
})

test('classifyProbeResult: un URL realmente sconosciuto continua a produrre unknown', () => {
  assert.equal(classifyProbeResult('https://www.pokemon-card.com/some-other-page.php'), 'unknown')
})

test('probeCardId: usa res.url finale (post-redirect) per classificare, mai lo status HTTP da solo', async () => {
  const fetchImpl = async () => ({ status: 200, url: 'https://www.pokemon-card.com/card-search/index.php?pg=' })
  const r = await probeCardId(52000, { fetchImpl })
  assert.equal(r.status, 'gap')
  assert.equal(r.httpStatus, 200) // verificato dal vivo: id invalido ridirige a 200, non 404
})

test('discoverForward: si ferma dopo N gap consecutivi (boundary), non scansiona oltre', async () => {
  // simula: id valido fino a 5, poi tutti gap
  const fetchImpl = async (url) => {
    const id = Number(url.match(/card\/(\d+)\//)[1])
    if (id <= 5) return { status: 200, url }
    return { status: 200, url: 'https://www.pokemon-card.com/card-search/index.php?pg=' }
  }
  const result = await discoverForward(1, { fetchImpl, stopAfterConsecutiveGaps: 3, hardLimit: 100 })
  assert.equal(result.found.length, 5)
  assert.equal(result.boundaryReached, true)
  assert.equal(result.newHighWaterMark, 5)
  // deve fermarsi subito dopo 3 gap consecutivi (id 6,7,8), non scansionare fino a 100
  assert.equal(result.idsProbed, 8)
})

test('discoverForward: hardLimit protegge da scansioni indefinite se non si trova mai un boundary', async () => {
  const fetchImpl = async (url) => ({ status: 200, url }) // sempre "found" -> mai un gap
  const result = await discoverForward(1, { fetchImpl, stopAfterConsecutiveGaps: 1000, hardLimit: 10 })
  assert.equal(result.idsProbed, 10)
  assert.equal(result.boundaryReached, false)
})

// --- CLI entrypoint detection (stesso bug latente Windows di sync-dry-run.mjs, corretto
// qui allo stesso modo per coerenza -- vedi sync-dry-run.mjs per la spiegazione completa) ---

test('isDirectCliInvocation: true quando argv[1] è il path reale del modulo (comportamento node <script>)', () => {
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

test('CLI smoke (subprocess reale): `node discover-cards.mjs` esegue davvero main() ed esce 0 con output, senza rete reale (hardLimit=0 tramite --from oltre la rete non è possibile senza mock; qui verifichiamo solo che main() venga invocato osservando lo stderr di avvio prima di qualunque fetch)', () => {
  // Non possiamo isolare completamente dalla rete come in sync-dry-run.mjs (discover-cards
  // non accetta --to), quindi verifichiamo l'invocazione di main() con un timeout breve e
  // controllando che il messaggio di avvio (scritto PRIMA di ogni fetch) sia stato prodotto
  // -- sufficiente per dimostrare che main() è stata davvero chiamata (il bug Windows la
  // saltava del tutto, zero output, way exit 0 immediato senza nulla su stderr).
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--from=999999999'], {
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.match(result.stderr, /\[discover-cards\] dry-run: probing forward/, 'main() deve essere stata invocata e aver scritto il log di avvio su stderr')
})
