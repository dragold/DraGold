import test from 'node:test'
import assert from 'node:assert/strict'
import { probeUrl } from '../crawl-images.mjs'

function fakeRes({ status, contentType, redirected = false, url = 'https://x/y', body = null }) {
  return {
    status,
    redirected,
    url,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => (body ? new Uint8Array(body).buffer : new ArrayBuffer(0)),
  }
}

test('probeUrl: HEAD 200 + content-type image/webp -> classification A', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/webp' })
  const r = await probeUrl('https://assets.tcgdex.net/en/x/1/high.webp', { fetchImpl })
  assert.equal(r.classification, 'A')
  assert.equal(r.httpStatus, 200)
})

test('probeUrl: 404 -> classification C, nessun retry (deterministico)', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return fakeRes({ status: 404, contentType: 'text/plain' }) }
  const r = await probeUrl('https://assets.tcgdex.net/ja/MC/676/high.webp', { fetchImpl })
  assert.equal(r.classification, 'C')
  assert.equal(calls, 1, 'un 404 non deve mai essere ritentato')
})

test('probeUrl: 403 -> classification E (WAF/hotlink), non confuso con 404', async () => {
  const fetchImpl = async () => fakeRes({ status: 403, contentType: 'text/html' })
  const r = await probeUrl('https://example.com/img', { fetchImpl })
  assert.equal(r.classification, 'E')
})

test('probeUrl: 200 ma content-type text/html (pagina WAF travestita) -> classification E, non A', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'text/html' })
  const r = await probeUrl('https://example.com/img', { fetchImpl })
  assert.equal(r.classification, 'E')
  assert.match(r.error, /content-type/)
})

test('probeUrl: 200 senza content-type ma magic bytes PNG validi -> classification A (sniff riuscito)', async () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const fetchImpl = async (url, opts) => {
    if (opts.method === 'HEAD') return fakeRes({ status: 200, contentType: null })
    return fakeRes({ status: 200, contentType: null, body: pngHeader })
  }
  const r = await probeUrl('https://example.com/img.png', { fetchImpl })
  assert.equal(r.classification, 'A')
})

test('probeUrl: redirect risolto verso immagine valida -> classification B, non A', async () => {
  const fetchImpl = async () => fakeRes({ status: 200, contentType: 'image/jpeg', redirected: true, url: 'https://example.com/final.jpg' })
  const r = await probeUrl('https://example.com/old-path.jpg', { fetchImpl })
  assert.equal(r.classification, 'B')
  assert.equal(r.finalUrl, 'https://example.com/final.jpg')
})

test('probeUrl: 503 transient -> retry con backoff, poi F se persiste oltre maxRetries', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return fakeRes({ status: 503, contentType: null }) }
  const r = await probeUrl('https://example.com/img', { fetchImpl, maxRetries: 2 })
  assert.equal(r.classification, 'F')
  assert.equal(calls, 3, 'deve tentare 1 iniziale + 2 retry')
})

test('probeUrl: 503 poi 200 valido al secondo tentativo -> recupera, classification A', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls++
    if (calls === 1) return fakeRes({ status: 503, contentType: null })
    return fakeRes({ status: 200, contentType: 'image/webp' })
  }
  const r = await probeUrl('https://example.com/img', { fetchImpl, maxRetries: 2 })
  assert.equal(r.classification, 'A')
  assert.equal(calls, 2)
})

test('probeUrl: 429 rate-limited -> transient, stesso trattamento di 5xx', async () => {
  const fetchImpl = async () => fakeRes({ status: 429, contentType: null })
  const r = await probeUrl('https://example.com/img', { fetchImpl, maxRetries: 1 })
  assert.equal(r.classification, 'F')
  assert.equal(r.httpStatus, 429)
})

test('probeUrl: network error/timeout -> retry poi F, error popolato', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET') }
  const r = await probeUrl('https://example.com/img', { fetchImpl, maxRetries: 1 })
  assert.equal(r.classification, 'F')
  assert.match(r.error, /ECONNRESET/)
})

test('probeUrl: HEAD 405 (non supportato dalla fonte) -> fallback a GET range, non fallisce a priori', async () => {
  let lastMethod = null
  const fetchImpl = async (url, opts) => {
    lastMethod = opts.method
    if (opts.method === 'HEAD') return fakeRes({ status: 405, contentType: null })
    return fakeRes({ status: 200, contentType: 'image/png' })
  }
  const r = await probeUrl('https://example.com/img', { fetchImpl })
  assert.equal(r.classification, 'A')
  assert.equal(lastMethod, 'GET', 'dopo un 405 su HEAD, l\'ultima chiamata deve essere una GET')
})
