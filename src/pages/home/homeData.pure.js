// Pure data-shaping helpers for the home page. No React, no JSX imports —
// so they can be unit-tested directly with `node --test`.

// 3 lesson entry points for the Knowledge stratum. Prefer the ones most
// relevant to a card in front of you (rarity, EN-vs-JP, anatomy), fall back
// to whatever lessons exist. Never invents a slug.
export function pickLessons(all, _cardName) {
  const want = ["rarity-variants", "pokemon-en-jp", "card-anatomy"];
  const bySlug = new Map((all || []).map((l) => [l.slug, l]));
  const out = [];
  for (const s of want) if (bySlug.has(s)) out.push(bySlug.get(s));
  for (const l of all || []) {
    if (out.length >= 3) break;
    if (!out.includes(l)) out.push(l);
  }
  return out.slice(0, 3).map(({ slug, title, summary, minutes, category }) => ({
    slug,
    title,
    summary,
    minutes,
    category,
  }));
}

// rows: [{ tcg, lang, n }] → { "pokemon:en": n|null, ... } for the four worlds.
export function shapeWorldCounts(rows) {
  const out = {
    "pokemon:en": null,
    "pokemon:ja": null,
    "onepiece:en": null,
    "onepiece:ja": null,
  };
  for (const r of rows || []) {
    const k = `${r.tcg}:${r.lang}`;
    if (k in out) out[k] = r.n;
  }
  return out;
}
