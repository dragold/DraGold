// Pick the home page's featured card. Pokémon EN/JA only, real clean image,
// no SAMPLE-watermarked art (the One Piece image pipeline serves watermarked
// scans — PRODUCT_SPEC §1 — so One Piece is excluded from curated/hero slots
// until that's fixed). Prefers visually striking cards (full-art / illustration
// rares) so the hero lands. Deterministic within a session so the whole Atlas
// doesn't reshuffle on every render.

// Rarities that make a great hero — big artwork, borderless, foil.
const HERO_RARITY = /special illustration rare|illustration rare|special art rare|full art|alt(ernate)? art|hyper rare|secret rare|rainbow rare|gold|character (super )?rare|art rare|\bSAR\b|\bSIR\b|\bAR\b/i;

export function selectFeatured(candidates) {
  const clean = (c) =>
    c &&
    c.tcg === "pokemon" &&
    (c.lang === "en" || c.lang === "ja") &&
    typeof c.name === "string" &&
    c.name.trim() &&
    typeof c.image_url === "string" &&
    !/sample/i.test(c.image_url);

  const pool = (candidates || []).filter(clean);
  if (!pool.length) return null;

  const hero = pool.filter((c) => c.rarity && HERO_RARITY.test(c.rarity));
  const shortlist = hero.length >= 3 ? hero : pool;

  // stable hash over the shortlist ids → same pick for the session
  let h = 0;
  for (const c of shortlist) {
    for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0;
  }
  return shortlist[Math.abs(h) % shortlist.length];
}
