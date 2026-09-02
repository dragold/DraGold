import test from 'node:test'
import assert from 'node:assert/strict'
import { tryOptcgOnePiece } from '../resolve-fallback.mjs'

function fakeFetch(optcgCards) {
  return async (url, options) => {
    if (options?.method === 'HEAD') {
      // probeUrl: HEAD 200 con content-type immagine, nessun redirect -> classification 'A'
      return {
        status: 200,
        redirected: false,
        url,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
      }
    }
    // fetchOptcgSet: GET su /sets/{setId}/
    return { ok: true, status: 200, json: async () => optcgCards }
  }
}

test('tryOptcgOnePiece: carta non onepiece -> null (stage non applicabile)', async () => {
  const r = await tryOptcgOnePiece({ tcg: 'pokemon', lang: 'en', set_id: 'sv1', card_number: '1' }, { fetchImpl: fakeFetch([]) })
  assert.equal(r, null)
})

test('tryOptcgOnePiece: lang=ja -> skipped esplicito, mai un fetch EN spacciato per JA', async () => {
  let called = false
  const fetchImpl = async (...args) => { called = true; return fakeFetch([])(...args) }
  const r = await tryOptcgOnePiece({ tcg: 'onepiece', lang: 'ja', set_id: 'OP-01', card_number: 'OP01-001' }, { fetchImpl })
  assert.equal(r.skipped, true)
  assert.match(r.reason, /solo EN/)
  assert.equal(called, false, 'non deve fare alcuna richiesta di rete per lang non supportata')
})

test('tryOptcgOnePiece: lang=en, carta trovata nel set -> resolved con source optcgapi', async () => {
  const cards = [
    { card_name: 'Monkey.D.Luffy', card_set_id: 'OP01-001', set_id: 'OP-01', set_name: 'Romance Dawn', rarity: 'L', card_image: 'https://optcgapi.com/img/OP01-001.png' },
  ]
  const card = { tcg: 'onepiece', lang: 'en', set_id: 'OP-01', card_number: 'OP01-001' }
  const r = await tryOptcgOnePiece(card, { fetchImpl: fakeFetch(cards) })
  assert.equal(r.verified, true)
  assert.equal(r.source, 'optcgapi')
  assert.equal(r.url, 'https://optcgapi.com/img/OP01-001.png')
  assert.equal(r.candidateMeta.number, 'OP01-001')
})

test('tryOptcgOnePiece: lang=en, carta assente dal set -> null (mai un URL inventato)', async () => {
  // set_id diverso dal test precedente: la cache di processo di tryOptcgOnePiece
  // e' per set_id, un ID gia' visto riuserebbe la risposta cachata invece di
  // rifare la fetch con questi dati.
  const cards = [
    { card_name: 'Altra carta', card_set_id: 'OP02-002', set_id: 'OP-02', set_name: 'Paramount War', rarity: 'C', card_image: 'https://optcgapi.com/img/OP02-002.png' },
  ]
  const card = { tcg: 'onepiece', lang: 'en', set_id: 'OP-02', card_number: 'OP02-001' }
  const r = await tryOptcgOnePiece(card, { fetchImpl: fakeFetch(cards) })
  assert.equal(r, null)
})
