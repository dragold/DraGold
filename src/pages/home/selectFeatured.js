// Pick the home page's featured card. Pokémon EN/JA only, real clean image,
// no SAMPLE-watermarked art (the One Piece image pipeline serves watermarked
// scans — PRODUCT_SPEC §1 — so One Piece is excluded from curated/hero slots
// until that's fixed). Deterministic within a session so the whole Atlas
// doesn't reshuffle on every render.
export function selectFeatured(candidates) {
  const ok = (c) =>
    c &&
    c.tcg === "pokemon" &&
    (c.lang === "en" || c.lang === "ja") &&
    typeof c.name === "string" &&
    c.name.trim() &&
    typeof c.image_url === "string" &&
    !/sample/i.test(c.image_url);

  const pool = (candidates || []).filter(ok);
  if (!pool.length) return null;

  let h = 0;
  for (const c of pool) {
    for (let i = 0; i < c.id.length; i++) {
      h = (h * 31 + c.id.charCodeAt(i)) | 0;
    }
  }
  return pool[Math.abs(h) % pool.length];
}
