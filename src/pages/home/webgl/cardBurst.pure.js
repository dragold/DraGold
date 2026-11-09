// Deterministic layout for the home card-explosion (CardBurst.jsx / CardCloud.jsx).
// Pure: no DOM, no three, no time. Given the same seed it always returns the
// same arrangement — SSR/CSR identical, and it is unit-testable.
//
// The explosion must read as a SYSTEM, not a random spray:
//   · three depth bands — foreground (few, large, sharp), midground (more,
//     medium), background (many, small, faint)
//   · nothing in the camera→hero corridor (screen-right) or the left text
//     column — cards frame the copy, they never sit on top of it
//   · a spread pose at rest that draws inward as the hero scrolls away

// tiny seeded PRNG (mulberry32) — kept local so this file has zero imports
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BANDS = {
  // z: distance from camera (camera sits at ~z 12). x/y: world spread.
  foreground: { count: 5, z: [3.5, 6.5], spread: [7.5, 4.6], scale: [1.15, 1.7], opacity: 1.0 },
  midground: { count: 12, z: [-2, 2], spread: [11, 7], scale: [0.7, 1.15], opacity: 0.72 },
  background: { count: 16, z: [-14, -6], spread: [17, 11], scale: [0.4, 0.75], opacity: 0.4 },
};

const lerp = (a, b, t) => a + (b - a) * t;

// Keep a slot out of the hero card's screen zone (right-of-centre, roughly
// centred vertically) and off the left copy column on wide layouts. Returns a
// nudged position — never rejects, so counts stay deterministic.
function frameHero(x, y, z) {
  // hero card occupies roughly x ∈ [0.6, 5], |y| < 4 at shallow depth
  if (x > 0.6 && x < 5 && Math.abs(y) < 4 && z > -3) {
    x = x < 2.8 ? x - 3.6 : x + 2.4;
  }
  // left copy column on the foreground band — push the card clear vertically
  if (z > 3 && x < -2.6 && x > -9.5) y = y < 0 ? y - 3.2 : y + 3.2;
  return [x, y];
}

/**
 * @param {object} [opts]
 * @param {number} [opts.seed]
 * @param {number} [opts.available] number of real card textures we actually have
 * @returns {{band:'foreground'|'midground'|'background', idx:number,
 *            x:number,y:number,z:number, rot:number, tilt:number,
 *            scale:number, opacity:number, phase:number, gold:boolean,
 *            drift:number, driftAmp:number}[]}
 */
export function generateCardBurst(opts = {}) {
  const { seed = 20260904, available = 12 } = opts;
  const rand = mulberry32(seed);
  const slots = [];

  for (const [band, cfg] of Object.entries(BANDS)) {
    for (let i = 0; i < cfg.count; i++) {
      const zr = rand();
      const rx = (rand() - 0.5) * 2 * cfg.spread[0];
      const ry = (rand() - 0.5) * 2 * cfg.spread[1];
      const z = lerp(cfg.z[0], cfg.z[1], zr);
      const [x, y] = frameHero(rx, ry, z);

      slots.push({
        band,
        // which real texture this slot shows (round-robins if we have fewer
        // textures than slots — repeats land in different bands/positions)
        idx: available > 0 ? slots.length % available : 0,
        x,
        y,
        z,
        rot: (rand() - 0.5) * 0.5, // z-roll, radians — minimal
        tilt: (rand() - 0.5) * 0.3, // y-rotation, radians — slight 3/4 view
        scale: lerp(cfg.scale[0], cfg.scale[1], rand()),
        opacity: cfg.opacity * lerp(0.8, 1, rand()),
        phase: rand() * Math.PI * 2,
        gold: rand() < 0.16,
        drift: 0.05 + rand() * 0.12, // slow bob speed
        driftAmp: 0.15 + rand() * 0.5, // bob amplitude (world units)
      });
    }
  }
  return slots;
}

export const CARD_BURST_TOTAL =
  BANDS.foreground.count + BANDS.midground.count + BANDS.background.count;
