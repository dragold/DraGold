import { test } from "node:test";
import assert from "node:assert/strict";
import { generateStarfield, VIEWBOX } from "./starfield.js";

test("generateStarfield is deterministic for a given seed", () => {
  const a = generateStarfield({ seed: 42 });
  const b = generateStarfield({ seed: 42 });
  assert.deepEqual(a, b);
});

test("different seeds produce different fields", () => {
  const a = generateStarfield({ seed: 1 });
  const b = generateStarfield({ seed: 2 });
  assert.notDeepEqual(a.stars, b.stars);
});

test("respects the requested star count and stays low by default", () => {
  assert.equal(generateStarfield({ stars: 30 }).stars.length, 30);
  assert.ok(
    generateStarfield().stars.length <= 90,
    "default field must not become a particle storm",
  );
});

test("all stars sit inside the viewbox", () => {
  for (const s of generateStarfield().stars) {
    assert.ok(s.x >= 0 && s.x <= VIEWBOX, `x in range: ${s.x}`);
    assert.ok(s.y >= 0 && s.y <= VIEWBOX, `y in range: ${s.y}`);
    assert.ok(s.r > 0 && s.r < 4, `radius small: ${s.r}`);
  }
});

test("builds two constellations whose links reference real nodes", () => {
  const { constellations } = generateStarfield();
  assert.equal(constellations.length, 2);
  for (const c of constellations) {
    assert.ok(c.nodes.length >= 4);
    assert.ok(c.links.length >= c.nodes.length - 1);
    for (const [a, b] of c.links) {
      assert.ok(c.nodes[a] && c.nodes[b], "link endpoints exist");
      assert.notEqual(a, b, "no self-link");
    }
    for (const n of c.nodes) {
      assert.ok(n.x >= 40 && n.x <= VIEWBOX - 40);
      assert.ok(n.y >= 40 && n.y <= VIEWBOX - 40);
    }
  }
});

test("a minority of stars carry the gold accent", () => {
  const stars = generateStarfield({ seed: 7 }).stars;
  const gold = stars.filter((s) => s.gold).length;
  assert.ok(gold > 0, "some gold stars");
  assert.ok(gold / stars.length < 0.35, "gold stays a minority");
});
