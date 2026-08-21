import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyPcgSearch } from '../sources/pcg-search-matcher.mjs'

test('verifyPcgSearch: carta EN -> skip, nessuna fetch', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return { ok: true, text: async () => '' } }
  const r = await verifyPcgSearch({ lang: 'en', name: 'Furret' }, { fetchImpl })
  assert.equal(r.checked, false)
  assert.equal(called, false)
})

test('verifyPcgSearch: trova il nome nei risultati -> found:true, image sempre null', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => '<div>リザードン - 1st弾</div>' })
  const r = await verifyPcgSearch({ lang: 'ja', name: 'リザードン' }, { fetchImpl })
  assert.equal(r.found, true)
  assert.equal(r.image, null)
})

test('verifyPcgSearch: nessun match testuale -> found:false', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => '<div>nessun risultato</div>' })
  const r = await verifyPcgSearch({ lang: 'ja', name: 'CartaInventata9999' }, { fetchImpl })
  assert.equal(r.found, false)
})

test('verifyPcgSearch: errore di rete -> found:false, non lancia, error nel note', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET') }
  const r = await verifyPcgSearch({ lang: 'ja', name: 'x' }, { fetchImpl })
  assert.equal(r.checked, true)
  assert.equal(r.found, false)
  assert.match(r.note, /ECONNRESET/)
})
