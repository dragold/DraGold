import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyOfficial, isKnownUnsupportedByOfficialSite } from '../sources/official-jp-matcher.mjs'

test('isKnownUnsupportedByOfficialSite: riconosce i set legacy verificati come non coperti', () => {
  for (const s of ['MC', 'PCG1', 'PCG4', 'VS1', 'E1', 'M2', 'M4', 'neo1', 'web1', 'PMCG1']) {
    assert.equal(isKnownUnsupportedByOfficialSite(s), true, `${s} dovrebbe essere riconosciuto come legacy`)
  }
  assert.equal(isKnownUnsupportedByOfficialSite('S12a'), false, 'un set moderno non deve matchare')
  assert.equal(isKnownUnsupportedByOfficialSite('SV10'), false)
})

test('verifyOfficial: carta EN -> skip immediato, nessuna fetch fatta', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return { ok: true, text: async () => '' } }
  const r = await verifyOfficial({ lang: 'en', name: 'Furret' }, { fetchImpl })
  assert.equal(r.checked, false)
  assert.equal(called, false)
})

test('verifyOfficial: set legacy noto -> skip immediato, nessuna fetch sprecata (verificato: sito non li copre)', async () => {
  let called = false
  const fetchImpl = async () => { called = true; return { ok: true, text: async () => '' } }
  const r = await verifyOfficial({ lang: 'ja', set_id: 'MC', name: 'test' }, { fetchImpl })
  assert.equal(r.checked, false)
  assert.equal(called, false)
  assert.equal(r.image, null)
})

test('verifyOfficial: set JA moderno -> fa la fetch, non ritorna MAI un campo image valorizzato', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => '<a href="details.php/card/42273/regu/all">x</a>' })
  const r = await verifyOfficial({ lang: 'ja', set_id: 'S12a', name: 'リーフィアVSTAR' }, { fetchImpl })
  assert.equal(r.checked, true)
  assert.equal(r.found, true)
  assert.equal(r.officialCardId, '42273')
  assert.equal(r.image, null, 'MAI un URL immagine da questo adapter, per policy ToS')
})

test('verifyOfficial: nessun risultato -> found:false, image sempre null', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => '<p>no results</p>' })
  const r = await verifyOfficial({ lang: 'ja', set_id: 'S12a', name: 'CartaInesistente' }, { fetchImpl })
  assert.equal(r.found, false)
  assert.equal(r.image, null)
})
