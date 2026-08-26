// validate-image.mjs
// Reuses the already-built, already-tested HEAD/GET-range image prober from
// scripts/image-audit/crawl-images.mjs rather than reimplementing HTTP validation.
// This is deliberate: probeUrl() already handles the HEAD-405-fallback bug fix,
// retry/backoff, and per-host rate limiting -- duplicating it here would be exactly
// the kind of unnecessary rewrite the mission asked to avoid.
//
// This module is the real HTTP-validation link in the MODERN pipeline:
//   discover -> fetch page -> parse -> extract image -> validate image HTTP -> classify
// sync-dry-run.mjs calls validateImageUrl() below for every discovered card that has an
// extracted image URL, and feeds the result into classify.mjs's classifyDiscovered() so
// it can tell IMAGE_MISSING (nothing extracted) apart from IMAGE_INVALID (extracted, but
// HTTP-validated as unusable) -- see classify.mjs's taxonomy doc comment for the full
// picture.

// NOTE (found while wiring this module into the real pipeline this pass): only probeUrl
// is actually exported by crawl-images.mjs -- createHostLimiter is a module-local helper,
// not exported. The previous version of this file re-exported both names, which meant any
// module actually importing from validate-image.mjs would have hit a hard SyntaxError
// (missing export) the moment it loaded -- previously undetected simply because nothing
// imported this module yet. Fixed here (within file scope, scripts/image-audit/* itself
// untouched) by only re-exporting what genuinely exists.
import { probeUrl } from '../../image-audit/crawl-images.mjs'

export { probeUrl }

// toImageVerdict: turns a raw probeUrl() result into the "usable / not usable, and why"
// signal classify.mjs needs.
//
// probeUrl's own classification alphabet (A/B/C/E/F, defined in crawl-images.mjs, NOT
// modified here -- out of scope for this pass) conflates two distinct real-world cases
// under a single 'E' bucket: a 403/401 (blocked/WAF) and a 2xx response whose body isn't
// actually an image (bad content-type / magic bytes). We disambiguate those here using
// the extra fields probeUrl already returns (httpStatus) rather than touching
// crawl-images.mjs. 'F' (429/5xx/timeout/network error, even after retries) is always a
// non-deterministic/transient reason -- never treated as proof the resource is invalid.
export function toImageVerdict(probe) {
  switch (probe.classification) {
    case 'A':
    case 'B':
      return { usable: true, reason: null }
    case 'C':
      // 404 / 410
      return { usable: false, reason: 'not_found' }
    case 'E':
      if (probe.httpStatus === 403 || probe.httpStatus === 401) {
        return { usable: false, reason: 'blocked' }
      }
      return { usable: false, reason: 'not_an_image' }
    case 'F':
      // 429 / 5xx / timeout / network error, even after retries -- inconclusive, not
      // deterministic invalidity.
      return { usable: false, reason: 'transient' }
    default:
      return { usable: false, reason: 'unknown' }
  }
}

// validateImageUrl: real HTTP validation for a single extracted image URL. Never mocked
// in production (sync-dry-run.mjs calls this with the real global fetch by default); a
// custom `fetchImpl` may be injected via opts, same DI pattern already used by
// lib/http.mjs and discover-cards.mjs, so unit tests never touch the real network.
export async function validateImageUrl(url, opts = {}) {
  if (!url) return { usable: null, reason: 'no_url', probe: null }
  const probe = await probeUrl(url, opts)
  return { ...toImageVerdict(probe), probe }
}
