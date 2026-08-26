import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreMatch } from '../match-confidence.mjs'

test('scoreMatch: grade A/B/D/E coerenti con level HIGH/HIGH/LOW/NO_MATCH', () => {
  const base = { name: 'Furret', card_number: '136', set_name: 'Darkness Ablaze', set_id: 'swsh3', lang: 'en' }
  assert.equal(scoreMatch(base, { name: 'Furret', number: '136', set: 'Darkness Ablaze', lang: 'en' }).grade, 'A')
  assert.equal(scoreMatch(base, { name: 'Furret', number: '136', set: 'Different', lang: 'en' }).grade, 'B')
  assert.equal(scoreMatch(base, { name: 'Furret', number: '999', set: 'Darkness Ablaze', lang: 'en' }).grade, 'D')
  assert.equal(scoreMatch(base, { name: 'Pikachu', number: '25', set: 'Base Set', lang: 'en' }).grade, 'E')
})

const CARD = { name: 'Furret', card_number: '136', set_name: 'Darkness Ablaze', set_id: 'swsh3', lang: 'en' }

test('scoreMatch: tutti i segnali coerenti -> HIGH', () => {
  const r = scoreMatch(CARD, { name: 'Furret', number: '136', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: nome+numero+lingua coerenti ma set diverso -> level HIGH/grade B (high-confidence, non exact) — aggiornato in questa sessione per allinearsi alla tassonomia A-E richiesta', () => {
  const r = scoreMatch(CARD, { name: 'Furret', number: '136', set: 'Some Totally Different Name', lang: 'en' })
  assert.equal(r.level, 'HIGH')
  assert.equal(r.grade, 'B')
})

test('scoreMatch: nome diverso, numero+lingua coerenti -> LOW (mai auto-scritto)', () => {
  // caso reale documentato nell'audit: "Empoleon" vs "Empoleon LV.X" — carte diverse, mai unire
  const r = scoreMatch({ ...CARD, name: 'Empoleon' }, { name: 'Empoleon LV.X', number: '136', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.level, 'LOW')
})

test('scoreMatch: nome coerente ma numero diverso -> LOW', () => {
  const r = scoreMatch(CARD, { name: 'Furret', number: '999', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.level, 'LOW')
})

test('scoreMatch: punteggiatura/case diversi nel nome non impediscono il match (normalizzazione)', () => {
  const r = scoreMatch({ ...CARD, name: 'Lycanroc GX' }, { name: 'Lycanroc-GX', number: '136', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: numero con suffisso "/102" normalizzato correttamente', () => {
  const r = scoreMatch({ ...CARD, card_number: '004' }, { name: 'Furret', number: '4/102', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: nessun segnale utile -> NO_MATCH', () => {
  const r = scoreMatch(CARD, { name: 'Pikachu', number: '25', set: 'Base Set', lang: 'en' })
  assert.equal(r.level, 'NO_MATCH')
})

test('scoreMatch: candidato assente -> NO_MATCH esplicito', () => {
  const r = scoreMatch(CARD, null)
  assert.equal(r.level, 'NO_MATCH')
})

// --- Regressione: normName() Unicode-safe (fix di questa sessione) ---
//
// Prima del fix, normName() filtrava via ogni carattere non ASCII (`.replace(/[^a-z0-9]/g,
// '')`), quindi un nome carta puramente giapponese normalizzava sempre a stringa vuota su
// entrambi i lati -> nameMatch strutturalmente impossibile, anche quando i due nomi erano
// identici carattere per carattere. Verificato dal vivo nel dry-run 49500-49510: gli id
// 49500 e 49506-49510 restavano AMBIGUOUS grade D nonostante candidato corretto già
// selezionato da classify.mjs. Questi test isolano il segnale nameMatch (via
// r.signals.nameMatch) tenendo fissi numero/lingua per verificare esattamente il
// comportamento di normName() attraverso scoreMatch(), senza esportare normName() stessa.

test('scoreMatch: nome giapponese puro identico su entrambi i lati (アリゲイツ, caso reale id 49500/MC-167) -> nameMatch=true, HIGH', () => {
  const card = { name: 'アリゲイツ', card_number: '167', set_name: 'スタートデッキ100 バトルコレクション', set_id: 'MC', lang: 'ja' }
  const r = scoreMatch(card, { name: 'アリゲイツ', number: '167/742', set: 'スタートデッキ100 バトルコレクション', lang: 'ja' })
  assert.equal(r.signals.nameMatch, true)
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: nome giapponese puro identico su entrambi i lati (クワッス) -> nameMatch=true, HIGH', () => {
  const card = { name: 'クワッス', card_number: '007', set_name: 'テスト産セット', set_id: 'MC', lang: 'ja' }
  const r = scoreMatch(card, { name: 'クワッス', number: '007/100', set: 'テスト産セット', lang: 'ja' })
  assert.equal(r.signals.nameMatch, true)
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: nome giapponese con suffisso ASCII "ex" (レジアイスex) -> nameMatch=true, il fix non rompe il caso misto già gestito prima', () => {
  const card = { name: 'レジアイスex', card_number: '211', set_name: 'スタートデッキ100 バトルコレクション', set_id: 'MC', lang: 'ja' }
  const r = scoreMatch(card, { name: 'レジアイスex', number: '211/742', set: 'スタートデッキ100 バトルコレクション', lang: 'ja' })
  assert.equal(r.signals.nameMatch, true)
  assert.equal(r.level, 'HIGH')
})

test('scoreMatch: caso ASCII già esistente (Furret) -> nameMatch=true, comportamento invariato dal fix', () => {
  const r = scoreMatch(CARD, { name: 'Furret', number: '136', set: 'Darkness Ablaze', lang: 'en' })
  assert.equal(r.signals.nameMatch, true)
})

test('scoreMatch: nomi giapponesi realmente diversi (アリゲイツ vs クワッス) -> nameMatch=false dopo normalizzazione, mai un falso match', () => {
  const card = { name: 'アリゲイツ', card_number: '167', set_name: 'スタートデッキ100 バトルコレクション', set_id: 'MC', lang: 'ja' }
  const r = scoreMatch(card, { name: 'クワッス', number: '167/742', set: 'スタートデッキ100 バトルコレクション', lang: 'ja' })
  assert.equal(r.signals.nameMatch, false)
})

test('scoreMatch: stesso suffisso ASCII "ex" ma base kanji diversa (ナニカex vs レジアイスex) -> nameMatch=false, il fix non fa collassare nomi diversi sul solo suffisso latino condiviso', () => {
  const card = { name: 'ナニカex', card_number: '211', set_name: 'MEGAドリームex', set_id: 'M2a', lang: 'ja' }
  const r = scoreMatch(card, { name: 'レジアイスex', number: '211/742', set: 'スタートデッキ100 バトルコレクション', lang: 'ja' })
  assert.equal(r.signals.nameMatch, false)
})
