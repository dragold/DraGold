import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyDiscovered, findCandidate, CLASSIFICATIONS } from '../classify.mjs'

const DB_ROWS = [
  { id: 'ja-swsh8-012', lang: 'ja', tcg: 'pokemon', name: 'リーフィアVSTAR', card_number: '012/172', set_name: 'VSTARユニバース', image_url_hi: 'https://assets.tcgdex.net/ja/swsh/swsh8/12/high.webp' },
]

test('CLASSIFICATIONS: espone la tassonomia definitiva come costante congelata', () => {
  assert.deepEqual(Object.keys(CLASSIFICATIONS).sort(), [
    'AMBIGUOUS', 'CHANGED', 'IMAGE_INVALID', 'IMAGE_MISSING', 'MISSING_FROM_SOURCE', 'NEW', 'UNCHANGED',
  ].sort())
  assert.ok(Object.isFrozen(CLASSIFICATIONS))
})

test('classifyDiscovered: id non trovato (gap) -> MISSING_FROM_SOURCE', () => {
  const r = classifyDiscovered({ found: false }, DB_ROWS, null)
  assert.equal(r.classification, 'MISSING_FROM_SOURCE')
})

test('classifyDiscovered: nessun candidato in DB -> NEW', () => {
  const discovered = { found: true, name: 'CartaMaiVista', cardNumber: '999/172', primarySetName: 'SetSconosciuto' }
  const r = classifyDiscovered(discovered, DB_ROWS, { image_url_hi: 'x' })
  assert.equal(r.classification, 'NEW')
})

test('classifyDiscovered: match HIGH, immagine diversa da quella già a DB -> CHANGED (consolidato da IMAGE_CHANGED, stesso bucket di nome/numero)', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/042273_P_RIFUIAVSTAR.jpg', image_url: null }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo)
  assert.equal(r.classification, 'CHANGED')
  assert.equal(r.candidate.id, 'ja-swsh8-012')
})

test('classifyDiscovered: match HIGH, nessuna immagine estratta dalla pagina -> IMAGE_MISSING (puramente estrattivo, nessuna validazione HTTP tentata)', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const r = classifyDiscovered(discovered, DB_ROWS, { image_url_hi: null, image_url: null })
  assert.equal(r.classification, 'IMAGE_MISSING')
  assert.equal(r.imageValidation, null)
})

test('classifyDiscovered: match HIGH, immagine estratta, nessun campo diverso -> UNCHANGED (ex EXISTING, stessa semantica)', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://assets.tcgdex.net/ja/swsh/swsh8/12/high.webp', image_url: null }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo, { imageValidation: { usable: true, reason: null } })
  assert.equal(r.classification, 'UNCHANGED')
})

test('classifyDiscovered: URL immagine estratto, validazione HTTP reale -> 404 -> IMAGE_INVALID (deterministico)', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/999999_dead.jpg', image_url: null }
  const imageValidation = { usable: false, reason: 'not_found', probe: { classification: 'C', httpStatus: 404 } }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo, { imageValidation })
  assert.equal(r.classification, 'IMAGE_INVALID')
  assert.equal(r.imageValidation.reason, 'not_found')
})

test('classifyDiscovered: URL immagine estratto, validazione HTTP reale -> risposta non immagine (content-type errato) -> IMAGE_INVALID', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/999999_dead.jpg', image_url: null }
  const imageValidation = { usable: false, reason: 'not_an_image', probe: { classification: 'E', httpStatus: 200 } }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo, { imageValidation })
  assert.equal(r.classification, 'IMAGE_INVALID')
  assert.equal(r.imageValidation.reason, 'not_an_image')
})

test('classifyDiscovered: URL immagine estratto, validazione HTTP reale -> 403 bloccato -> IMAGE_INVALID', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/999999_dead.jpg', image_url: null }
  const imageValidation = { usable: false, reason: 'blocked', probe: { classification: 'E', httpStatus: 403 } }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo, { imageValidation })
  assert.equal(r.classification, 'IMAGE_INVALID')
  assert.equal(r.imageValidation.reason, 'blocked')
})

test('classifyDiscovered: errore di rete/HTTP transient (429/5xx/timeout) durante la validazione -> AMBIGUOUS, MAI IMAGE_INVALID (non è una prova deterministica)', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/999999_dead.jpg', image_url: null }
  const imageValidation = { usable: false, reason: 'transient', probe: { classification: 'F', httpStatus: null } }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo, { imageValidation })
  assert.equal(r.classification, 'AMBIGUOUS')
  assert.notEqual(r.classification, 'IMAGE_INVALID')
})

test('classifyDiscovered: URL immagine estratto MA nessuna validazione fornita (imageValidation assente) -> non blocca su IMAGE_INVALID, continua al confronto campi', () => {
  const discovered = { found: true, name: 'リーフィアVSTAR', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const imageInfo = { image_url_hi: 'https://assets.tcgdex.net/ja/swsh/swsh8/12/high.webp', image_url: null }
  const r = classifyDiscovered(discovered, DB_ROWS, imageInfo)
  assert.equal(r.classification, 'UNCHANGED')
})

test('classifyDiscovered: match debole (numero coerente ma nome diverso) -> AMBIGUOUS, mai auto-scritto', () => {
  const discovered = { found: true, name: 'NomeCompletamenteDiverso', cardNumber: '012/172', primarySetName: 'VSTARユニバース' }
  const r = classifyDiscovered(discovered, DB_ROWS, { image_url_hi: 'x' })
  assert.equal(r.classification, 'AMBIGUOUS')
})

test('findCandidate: nessun cardNumber nel record scoperto -> null, nessun crash', () => {
  assert.equal(findCandidate({ cardNumber: null }, DB_ROWS), null)
})

// --- Regressione: priorità del set code ufficiale (bug reale osservato nel dry-run
// 49500-49510, ids 49500/49506-49510) ---
//
// Scenario reale osservato: più righe DB condividono lo stesso card_number ("167", "211"
// ecc.) in set diversi (es. MC e M2a, entrambi prodotti reali con numerazioni proprie).
// Senza il set code ufficiale, findCandidate non aveva modo di distinguerle e sceglieva
// per ordine di iterazione, producendo match verso il set sbagliato (es. M2a-167 invece
// di MC-167 per l'id 49500, la cui pagina ufficiale espone set code "MC" nel path
// immagine). Le righe/nomi usati qui sono illustrativi (stesso pattern osservato: stesso
// card_number, set_id diversi), non un dump letterale del DB reale -- la verifica con i
// dati reali resta il dry-run vero e proprio, non questo test.

const AMBIGUOUS_SET_POOL = [
  { id: 'ja-m2a-167', lang: 'ja', tcg: 'pokemon', name: 'CartaM2a167', card_number: '167/250', set_id: 'M2a', set_name: 'MEGAドリームex' },
  { id: 'ja-mc-167', lang: 'ja', tcg: 'pokemon', name: 'アリゲイツ', card_number: '167/742', set_id: 'MC', set_name: 'スタートデッキ100 バトルコレクション' },
]

test('findCandidate: id 49500 (card_number 167, setCode ufficiale MC) -> preferisce MC-167 su M2a-167 anche se M2a è prima nel pool', () => {
  const discovered = { found: true, name: 'アリゲイツ', cardNumber: '167/742', primarySetName: null }
  const result = findCandidate(discovered, AMBIGUOUS_SET_POOL, 'MC')
  assert.equal(result.row.id, 'ja-mc-167')
})

test('findCandidate: senza setCode ufficiale (comportamento pre-fix) -> nessuna priorità di set, resta il comportamento originale basato solo su scoreMatch/ordine', () => {
  const discovered = { found: true, name: 'NomeNonCorrispondente', cardNumber: '167/742', primarySetName: null }
  const result = findCandidate(discovered, AMBIGUOUS_SET_POOL, null)
  // nessun segnale di set -> il primo del pool con lo score migliore (qui pari, entrambi
  // NO_MATCH sul nome) vince per ordine di iterazione, com'era prima di questo fix
  assert.equal(result.row.id, 'ja-m2a-167')
})

const AMBIGUOUS_SET_POOL_2 = [
  { id: 'ja-m2a-211', lang: 'ja', tcg: 'pokemon', name: 'CartaM2a211', card_number: '211/250', set_id: 'M2a', set_name: 'MEGAドリームex' },
  { id: 'ja-mc-211', lang: 'ja', tcg: 'pokemon', name: 'CartaMC211', card_number: '211/742', set_id: 'MC', set_name: 'スタートデッキ100 バトルコレクション' },
]

test('findCandidate: id 49506 (card_number 211, setCode ufficiale MC) -> preferisce MC-211 su M2a-211', () => {
  const discovered = { found: true, name: 'CartaMC211', cardNumber: '211/742', primarySetName: null }
  const result = findCandidate(discovered, AMBIGUOUS_SET_POOL_2, 'MC')
  assert.equal(result.row.id, 'ja-mc-211')
})

test('classifyDiscovered: setCode ufficiale letto da imageInfo.setCode (wiring end-to-end) -> sceglie il candidato MC corretto E la classificazione finale è UNCHANGED (aggiornato in questa sessione dopo il fix di match-confidence.mjs::normName())', () => {
  // STORIA di questo test (importante per non regredire): prima della sessione corrente,
  // match-confidence.mjs::normName() rimuoveva OGNI carattere non-ASCII
  // (`.replace(/[^a-z0-9]/g, '')`), quindi normName('アリゲイツ') === '' su entrambi i lati
  // per un nome puramente giapponese senza suffissi latini -> nameMatch era strutturalmente
  // impossibile, e la classificazione restava AMBIGUOUS anche quando il candidato scelto
  // era già quello corretto (questo test asseriva 'AMBIGUOUS' fino a questa sessione).
  // Root cause fissata in questa sessione: normName() ora usa `.normalize('NFKC')` +
  // `\p{L}`/`\p{N}` (Unicode property escapes, flag `u`) invece del filtro ASCII-only,
  // quindi i caratteri giapponesi (kanji/hiragana/katakana) sono confrontati correttamente
  // -- vedi scripts/image-audit/match-confidence.mjs e i suoi test dedicati per la verifica
  // isolata del segnale nameMatch. Con nameMatch ora vero per アリゲイツ === アリゲイツ,
  // numberMatch vero (167/742 su entrambi i lati) e langMatch vero, scoreMatch restituisce
  // HIGH/grade B (il set diverge solo perché discovered.primarySetName è null in questo
  // fixture, non un fallimento del match) -- classifyDiscovered prosegue oltre la soglia
  // HIGH, non trova alcun campo tracciato diverso (nome/numero/immagine tutti coerenti col
  // candidato ja-mc-167) e restituisce quindi UNCHANGED, non più AMBIGUOUS.
  const discovered = { found: true, name: 'アリゲイツ', cardNumber: '167/742', primarySetName: null }
  const imageInfo = { image_url_hi: 'https://www.pokemon-card.com/assets/images/card_images/large/MC/049500_P_ARIGEITSU.jpg', image_url: null, setCode: 'MC' }
  const r = classifyDiscovered(discovered, AMBIGUOUS_SET_POOL, imageInfo)
  assert.equal(r.candidate.id, 'ja-mc-167') // il fix del set-code: prima sarebbe stato ja-m2a-167
  assert.equal(r.classification, 'UNCHANGED') // il fix di normName: prima di questa sessione era AMBIGUOUS
})

test('classifyDiscovered: nome scoperto con suffisso ASCII (es. "ex", comune nei nomi carta giapponesi moderni) -> normName produce un segnale non vuoto, setCode risolve correttamente l\'ambiguità tra set', () => {
  // Scenario plausibile per 49501-49505 (CHANGED nel dry-run reale): suffissi come "ex" /
  // "GX" / "VMAX" restano lettere latine anche dentro un nome altrimenti giapponese, quindi
  // normName() li confronta. Se DUE carte diverse in set diversi condividono lo stesso
  // suffisso (es. entrambe "...ex"), nameMatch può risultare true per ENTRAMBE -- è
  // esattamente lo scenario in cui, senza setCode, si rischia un match nel set sbagliato.
  const pool = [
    { id: 'ja-m2a-211', lang: 'ja', tcg: 'pokemon', name: 'ナニカex', card_number: '211/250', set_id: 'M2a', set_name: 'MEGAドリームex' },
    { id: 'ja-mc-211', lang: 'ja', tcg: 'pokemon', name: 'レジアイスex', card_number: '211/742', set_id: 'MC', set_name: 'スタートデッキ100 バトルコレクション' },
  ]
  const discovered = { found: true, name: 'レジアイスex', cardNumber: '211/742', primarySetName: null }
  const imageInfo = { image_url_hi: 'x', image_url: null, setCode: 'MC' }
  const r = classifyDiscovered(discovered, pool, imageInfo)
  assert.equal(r.candidate.id, 'ja-mc-211')
  assert.notEqual(r.classification, 'AMBIGUOUS')
})
