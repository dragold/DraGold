// CORS-safe image URL for a WebGL texture.
// Cached (Supabase Storage) URLs are same-origin / CORS-permissive.
// External CDNs differ: Scryfall and TCGdex send Access-Control-Allow-Origin: *,
// so their URLs work directly in WebGL. YGOProDeck and pokemontcg.io do NOT, so
// those route through the /api/img proxy (which streams them with CORS headers).
const CORS_SAFE_HOSTS = new Set([
  "cards.scryfall.io",
  "scryfall.io",
  "assets.tcgdex.net",
  "tcgdex.net",
  "pimwkmwrduqkaydyvxqz.supabase.co",
]);

export function webglImage(card) {
  if (!card) return null;
  const cache = Array.isArray(card.card_image_cache) ? card.card_image_cache : [];
  const ready = cache.find((c) => c && c.status === "ready" && c.cached_url);
  if (ready) return ready.cached_url;

  const raw = card.image_url_hi || card.image_url;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // CORS-safe hosts: use raw URL directly (WebGL can load these)
    if (CORS_SAFE_HOSTS.has(u.hostname)) return raw;
    // In dev mode the /api/img Edge Function is not available (only deployed
    // on Vercel), so fall back to the raw URL — the browser may still block
    // some origins via CORS, but Scryfall/TCGdex will work.
    if (import.meta.env?.DEV) return raw;
  } catch {
    return null;
  }
  // Non-CORS host: route through /api/img proxy (adds CORS headers)
  return `/api/img?u=${encodeURIComponent(raw)}`;
}
