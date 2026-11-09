import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCardBurst, BANDS, CARD_BURST_TOTAL } from "./cardBurst.pure.js";

test("deterministic for a given seed", () => {
  assert.deepEqual(generateCardBurst({ seed: 1 }), generateCardBurst({ seed: 1 }));
});

test("different seeds differ", () => {
  assert.notDeepEqual(
    generateCardBurst({ seed: 1 }).map((s) => [s.x, s.y]),
    generateCardBurst({ seed: 2 }).map((s) => [s.x, s.y]),
  );
});

test("emits exactly the three bands with the configured counts", () => {
  const slots = generateCardBurst();
  assert.equal(slots.length, CARD_BURST_TOTAL);
  for (const band of Object.keys(BANDS)) {
    assert.equal(
      slots.filter((s) => s.band === band).length,
      BANDS[band].count,
      band,
    );
  }
});

test("foreground is nearer, larger and more opaque than background", () => {
  const slots = generateCardBurst();
  const fg = slots.filter((s) => s.band === "foreground");
  const bg = slots.filter((s) => s.band === "background");
  const avg = (a, k) => a.reduce((n, s) => n + s[k], 0) / a.length;
  assert.ok(avg(fg, "z") > avg(bg, "z"), "foreground z closer to camera");
  assert.ok(avg(fg, "scale") > avg(bg, "scale"), "foreground larger");
  assert.ok(avg(fg, "opacity") > avg(bg, "opacity"), "foreground more opaque");
});

test("no slot sits in the hero card's screen zone", () => {
  for (const s of generateCardBurst()) {
    const inHeroZone = s.x > 0.6 && s.x < 5 && Math.abs(s.y) < 4 && s.z > -3;
    assert.ok(!inHeroZone, `slot clear of hero: ${s.x.toFixed(1)},${s.y.toFixed(1)}`);
  }
});

test("rotations stay minimal and gold stays a minority", () => {
  const slots = generateCardBurst({ seed: 9 });
  for (const s of slots) {
    assert.ok(Math.abs(s.rot) <= 0.25, "z-roll < ~15deg");
    assert.ok(Math.abs(s.tilt) <= 0.15, "y-tilt < ~9deg");
  }
  assert.ok(slots.filter((s) => s.gold).length / slots.length < 0.3);
});

test("idx round-robins over the available texture count", () => {
  const slots = generateCardBurst({ available: 4 });
  for (const s of slots) assert.ok(s.idx >= 0 && s.idx < 4);
  assert.equal(generateCardBurst({ available: 0 })[0].idx, 0);
});
