import { test } from "node:test";
import assert from "node:assert/strict";
import { selectFeatured } from "./selectFeatured.js";

const rows = [
  { id: "a", tcg: "pokemon", lang: "en", name: "Charizard", image_url: "https://x/char.png" },
  { id: "b", tcg: "onepiece", lang: "en", name: "Luffy", image_url: "https://x/luffy.png" },
  { id: "c", tcg: "pokemon", lang: "ja", name: "Pikachu", image_url: "https://x/SAMPLE_pika.png" },
  { id: "d", tcg: "pokemon", lang: "de", name: "Glurak", image_url: "https://x/glurak.png" },
  { id: "e", tcg: "pokemon", lang: "ja", name: "Mew", image_url: "https://x/mew.png" },
];

test("only pokemon en/ja with a clean image qualify", () => {
  const picked = selectFeatured(rows);
  assert.ok(["a", "e"].includes(picked.id));
});

test("rejects SAMPLE-watermarked images", () => {
  assert.notEqual(selectFeatured(rows)?.id, "c");
});

test("deterministic for the same input", () => {
  assert.equal(selectFeatured(rows).id, selectFeatured(rows).id);
});

test("returns null when nothing qualifies", () => {
  assert.equal(
    selectFeatured([{ id: "z", tcg: "mtg", lang: "en", name: "x", image_url: "y" }]),
    null
  );
  assert.equal(selectFeatured([]), null);
  assert.equal(selectFeatured(null), null);
});
