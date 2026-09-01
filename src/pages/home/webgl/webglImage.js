// A CORS-safe image URL for a WebGL texture. Cached (Supabase Storage) URLs
// already send permissive CORS; external CDN URLs (pokemontcg.io, tcgdex) do
// not, so those route through the /api/img proxy on our own origin.
export function webglImage(card) {
  if (!card) return null;
  const cache = Array.isArray(card.card_image_cache) ? card.card_image_cache : [];
  const ready = cache.find((c) => c && c.status === "ready" && c.cached_url);
  if (ready) return ready.cached_url;

  const raw = card.image_url_hi || card.image_url;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // same-origin or already-CORS-ok hosts: use directly
    if (u.hostname.endsWith("supabase.co")) return raw;
  } catch {
    return null;
  }
  return `/api/img?u=${encodeURIComponent(raw)}`;
}
