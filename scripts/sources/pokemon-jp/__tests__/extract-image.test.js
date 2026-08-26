import test from 'node:test'
import assert from 'node:assert/strict'
import { extractImageUrls, extractPrimaryImage, extractSetCode } from '../extract-image.mjs'

// Verified real pattern (2026-08-17): id 42273, set S12a, name リーフィアVSTAR.
const REAL_URL = 'https://www.pokemon-card.com/assets/images/card_images/large/S12a/042273_P_RIFUIAVSTAR.jpg'

// Verified LIVE against the real site (2026-08-17, id 49500) -- this is the actual raw
// markup returned by pokemon-card.com, captured via `document.querySelector('img[src*=
// "card_images"]').outerHTML` in a real browser session (i.e. the real HTML attribute
// value, not a DOM-resolved/absolute property like currentSrc). Root-relative, no domain.
const REAL_RELATIVE_IMG_HTML = '<img class="fit" src="/assets/images/card_images/large/MC/049500_P_ARIGEITSU.jpg" alt="アリゲイツ">'
const REAL_RELATIVE_ABSOLUTE_EXPECTED = 'https://www.pokemon-card.com/assets/images/card_images/large/MC/049500_P_ARIGEITSU.jpg'

// Second independent real sample (2026-08-17, id 49501), same relative-path shape.
const REAL_RELATIVE_IMG_HTML_2 = '<img class="fit" src="/assets/images/card_images/large/MC/049501_P_MODAIRUEX.jpg" alt="メガオーダイルex">'

test('extractImageUrls: trova un URL immagine reale incorporato nell\'HTML', () => {
  const html = `<img src="${REAL_URL}" data-foo="bar">`
  const urls = extractImageUrls(html)
  assert.deepEqual(urls, [REAL_URL])
})

test('extractImageUrls: nessuna corrispondenza -> array vuoto, mai inventare un URL', () => {
  assert.deepEqual(extractImageUrls('<div>no image here</div>'), [])
  assert.deepEqual(extractImageUrls(''), [])
  assert.deepEqual(extractImageUrls(null), [])
})

test('extractPrimaryImage: solo "large" trovato -> usato sia per image_url che image_url_hi (mai una seconda risoluzione fabbricata)', () => {
  const html = `<img src="${REAL_URL}">`
  const r = extractPrimaryImage(html)
  assert.equal(r.image_url_hi, REAL_URL)
  assert.equal(r.image_url, REAL_URL)
})

test('extractPrimaryImage: large + small distinti -> mappati correttamente su image_url_hi / image_url', () => {
  const small = REAL_URL.replace('/large/', '/small/')
  const html = `<img src="${REAL_URL}"><img src="${small}">`
  const r = extractPrimaryImage(html)
  assert.equal(r.image_url_hi, REAL_URL)
  assert.equal(r.image_url, small)
})

// --- Regressione bug reale (2026-08-17): src root-relative (senza dominio) ---
// Prima di questo fix, extractImageUrls richiedeva il dominio assoluto letterale
// nell'HTML e quindi non trovava MAI un'immagine sull'HTML reale servito dal sito
// (che usa src root-relative), risultando sempre in image_url/image_url_hi = null.

test('extractImageUrls: src root-relative reale (senza dominio) -> risolto in URL assoluto contro il vero origin della pagina', () => {
  const urls = extractImageUrls(REAL_RELATIVE_IMG_HTML)
  assert.deepEqual(urls, [REAL_RELATIVE_ABSOLUTE_EXPECTED])
})

test('extractPrimaryImage: markup reale root-relative (id 49500) -> image_url_hi popolato, non più null', () => {
  const r = extractPrimaryImage(REAL_RELATIVE_IMG_HTML)
  assert.equal(r.image_url_hi, REAL_RELATIVE_ABSOLUTE_EXPECTED)
  assert.equal(r.image_url, REAL_RELATIVE_ABSOLUTE_EXPECTED)
})

test('extractImageUrls: assoluto e root-relative per lo stesso URL non producono duplicati', () => {
  const html = `<img src="${REAL_RELATIVE_ABSOLUTE_EXPECTED}"><img src="/assets/images/card_images/large/MC/049500_P_ARIGEITSU.jpg">`
  assert.deepEqual(extractImageUrls(html), [REAL_RELATIVE_ABSOLUTE_EXPECTED])
})

test('extractSetCode: codice set ufficiale reale (MC) letto dal path immagine, mai inferito da un match TCGdex', () => {
  assert.equal(extractSetCode(REAL_RELATIVE_IMG_HTML), 'MC')
  assert.equal(extractSetCode(REAL_RELATIVE_IMG_HTML_2), 'MC')
  assert.equal(extractSetCode(`<img src="${REAL_URL}">`), 'S12a')
})

test('extractSetCode: nessuna immagine trovata -> null, mai un valore inventato', () => {
  assert.equal(extractSetCode('<div>no image</div>'), null)
  assert.equal(extractSetCode(''), null)
})
