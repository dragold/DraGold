import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLessons, shapeWorldCounts } from "./homeData.pure.js";

const lessons = [
  { slug: "tcg-basics", title: "A", summary: "s", minutes: 3, category: "x" },
  { slug: "card-anatomy", title: "B", summary: "s", minutes: 3, category: "x" },
  { slug: "rarity-variants", title: "C", summary: "s", minutes: 3, category: "x" },
  { slug: "pokemon-en-jp", title: "D", summary: "s", minutes: 3, category: "x" },
  { slug: "collection-basics", title: "E", summary: "s", minutes: 2, category: "x" },
];

test("pickLessons prefers rarity → en-jp → anatomy, returns 3", () => {
  const out = pickLessons(lessons);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((l) => l.slug),
    ["rarity-variants", "pokemon-en-jp", "card-anatomy"]
  );
});

test("pickLessons falls back when preferred slugs are missing", () => {
  const out = pickLessons(lessons.slice(0, 2));
  assert.equal(out.length, 2);
  assert.equal(out[0].slug, "card-anatomy");
});

test("pickLessons projects only the display fields", () => {
  const out = pickLessons(lessons);
  assert.deepEqual(Object.keys(out[0]).sort(), ["category", "minutes", "slug", "summary", "title"]);
});

test("shapeWorldCounts maps known keys, ignores others", () => {
  const out = shapeWorldCounts([
    { tcg: "pokemon", lang: "en", n: 10 },
    { tcg: "pokemon", lang: "fr", n: 99 },
  ]);
  assert.equal(out["pokemon:en"], 10);
  assert.equal(out["onepiece:ja"], null);
  assert.equal(out["pokemon:fr"], undefined);
});
