// extract-image.mjs
// Extracts the REAL card image URL from a fetched card-detail page.
//
// Policy (per mission constraints): prefer page-extraction over URL reconstruction.
// We never synthesize /assets/images/card_images/large/{set}/{id}_{X}_{NAME}.jpg
// ourselves -- we only accept a URL that actually appeared in the page's HTML/DOM,
// because the supertype marker (P/T/E) and the romanized name segment are not
// reliably derivable from DB fields alone (verified example:
// https://www.pokemon-card.com/assets/images/card_images/large/S12a/042273_P_RIFUIAVSTAR.jpg
// for id 42273 / set S12a / name リーフィアVSTAR -- "RIFUIAVSTAR" is a lossy romanization
// that a naive transliterator would not reproduce byte-for-byte).
//
// BUG FIX (2026-08-17, root-caused live): extractImageUrls previously required the image
// URL to appear as an ABSOLUTE URL (literal "https://www.pokemon-card.com/..." prefix) in
// the raw HTML. That was true of the fixture used when this file was first written, but
// that fixture was captured via a browser's DOM-resolved `img.currentSrc`, which the
// browser ALWAYS resolves to an absolute URL regardless of what the raw markup contains.
// Verified live against the real site (ids 49500/49501/49502, 2026-08-17) that the actual
// served HTML uses a ROOT-RELATIVE src attribute with no domain at all, e.g.:
//   <img class="fit" src="/assets/images/card_images/large/MC/049500_P_ARIGEITSU.jpg" alt="...">
// The old regex never matched this real shape, so extractImageUrls always returned [] and
// every discovered card was classified with imageInfo=null (image_url/image_url_hi both
// null), independent of whether the card actually has an image. The regex now matches both
// forms; a root-relative match is resolved to absolute against the page's own known origin
// (https://www.pokemon-card.com -- the exact host we fetched the page from, not a guess).
// This is standard relative-URL resolution against a known base, not URL reconstruction:
// the path, set code, id, supertype marker and romanized name all still come verbatim from
// the page itself, nothing is synthesized.

const ORIGIN = 'https://www.pokemon-card.com'
const CARD_IMAGE_RE = /(?:https?:\/\/www\.pokemon-card\.com)?\/assets\/images\/card_images\/(?:large|small)\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi

export function extractImageUrls(html) {
  if (!html) return []
  const matches = html.match(CARD_IMAGE_RE) || []
  const absolute = matches.map((m) => (m.startsWith('http') ? m : ORIGIN + m))
  // de-dup while preserving order
  return [...new Set(absolute)]
}

// extractSetCode: pulls the official set/product code (e.g. "MC", "S12a") out of the same
// image path used by extractImageUrls -- verified live to be the segment right after
// /large/ or /small/. This is the official set code itself, read directly off the page's
// own asset path, never inferred from a TCGdex/DB match.
export function extractSetCode(html) {
  const urls = extractImageUrls(html)
  if (!urls.length) return null
  const m = urls[0].match(/\/card_images\/(?:large|small)\/([^/]+)\//)
  return m ? m[1] : null
}

// extractPrimaryImage: picks the "large" variant as image_url_hi and, if a distinct
// "small" variant is also present, that as image_url. If only one variant is found,
// both fields point at it (never fabricate a second resolution).
//
// Also carries `setCode` (via extractSetCode, same underlying image path) so callers
// downstream of a single extraction call have the official set code available without
// re-parsing the HTML -- this is what classify.mjs's findCandidate now uses as a
// set-priority signal (see classify.mjs).
export function extractPrimaryImage(html) {
  const urls = extractImageUrls(html)
  const setCode = extractSetCode(html)
  const large = urls.find((u) => u.includes('/large/'))
  const small = urls.find((u) => u.includes('/small/'))
  if (!large && !small) return { image_url: null, image_url_hi: null, candidates: urls, setCode }
  return {
    image_url: small || large,
    image_url_hi: large || small,
    candidates: urls,
    setCode,
  }
}
