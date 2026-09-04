// Deterministic generator for the DraGold night sky — the atmospheric layer
// behind every route (see NightSky.jsx). Pure: no DOM, no globals, no time.
// Given the same seed it always returns the same field, so SSR/CSR and every
// reload are identical and it is trivially testable.
//
// The concept is "TCG Intelligence Universe": a calm deep-navy field with a
// few dozen discreet stars and TWO small constellations whose thin links
// suggest relation / collection / knowledge — never a particle storm, never a
// blockchain mesh. Counts are intentionally low.

// mulberry32 — tiny seeded PRNG (same one used by the home WebGL field, kept
// local so this module has zero imports).
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The SVG coordinate space the field is generated in. NightSky renders it with
// preserveAspectRatio="xMidYMid slice", so treat it as a 1000×1000 canvas that
// gets cropped, not stretched.
export const VIEWBOX = 1000;

const DEFAULTS = {
  seed: 20260904,
  stars: 68, // ambient scatter — "presente ma bilanciato"
  constellations: 2, // two small named-feeling clusters
  nodesPerConstellation: [6, 5], // node count per cluster
  goldStarRatio: 0.14, // a minority of stars carry the gold accent
};

// One constellation: a handful of nodes placed loosely around an anchor, then
// linked as a short path + one or two cross-links so it reads as a figure, not
// a random spray. Nearest-neighbour chaining keeps the lines short.
function buildConstellation(rand, anchor, count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      x: clamp(anchor.x + (rand() - 0.5) * 260, 40, VIEWBOX - 40),
      y: clamp(anchor.y + (rand() - 0.5) * 220, 40, VIEWBOX - 40),
      r: 1.7 + rand() * 1.6,
      gold: rand() < 0.4, // constellation nodes lean gold more than field stars
    });
  }

  // chain each node to its nearest not-yet-linked neighbour
  const links = [];
  const used = new Set();
  let current = 0;
  used.add(0);
  for (let step = 0; step < count - 1; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < count; j++) {
      if (used.has(j)) continue;
      const d = dist2(nodes[current], nodes[j]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best === -1) break;
    links.push([current, best]);
    used.add(best);
    current = best;
  }
  // one extra cross-link for a closed, figure-like shape
  if (count > 3) links.push([0, count - 2]);

  return { nodes, links };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * @param {object} [opts]
 * @returns {{
 *   stars: {x:number,y:number,r:number,gold:boolean,delay:number,dur:number}[],
 *   constellations: {nodes:{x:number,y:number,r:number,gold:boolean}[],links:[number,number][]}[]
 * }}
 */
export function generateStarfield(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const rand = mulberry32(cfg.seed);

  // Ambient stars — biased away from the dead-centre so they never fight with
  // hero content, and kept small.
  const stars = [];
  for (let i = 0; i < cfg.stars; i++) {
    const edgeBias = rand();
    const x = rand() * VIEWBOX;
    // push vertically toward top & bottom thirds
    let y = rand() * VIEWBOX;
    if (edgeBias < 0.55) y = y < 500 ? y * 0.7 : 1000 - (1000 - y) * 0.7;
    stars.push({
      x,
      y,
      r: 0.6 + rand() * 1.5,
      gold: rand() < cfg.goldStarRatio,
      delay: -rand() * 6, // negative so twinkle is already mid-cycle on load
      dur: 3.5 + rand() * 5.5, // slow, individually varied
    });
  }

  // Two constellations, anchored in opposite quadrants.
  const anchors = [
    { x: VIEWBOX * 0.24, y: VIEWBOX * 0.26 },
    { x: VIEWBOX * 0.78, y: VIEWBOX * 0.7 },
  ];
  const constellations = [];
  for (let c = 0; c < cfg.constellations; c++) {
    const anchor = anchors[c % anchors.length];
    const n = cfg.nodesPerConstellation[c] || 5;
    constellations.push(buildConstellation(rand, anchor, n));
  }

  return { stars, constellations };
}
