import { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";

// DraGold's universe of collectible objects. Not a star grid, not a galaxy —
// card-shaped silhouettes drifting in organic lumps deep in the void, gold
// (mostly) and periwinkle, with a sparse glint layer and faint relation
// threads. It's the space the Atlas travels through and returns to.
const COUNT = 120;
const clamp = THREE.MathUtils.clamp;
const seg = (p, i) => clamp((p - i / 6) / (1 / 6), 0, 1);

function fieldRetreat(p) {
  const s3 = seg(p, 2), s4 = seg(p, 3), s5 = seg(p, 4), s6 = seg(p, 5);
  return clamp(0.3 * s3 + 0.85 * s4 + 0.55 * s5 - 2.4 * s6, -2.6, 1.2);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a soft rounded-card alpha, drawn once
let _cardTex = null;
function cardAlpha() {
  if (_cardTex) return _cardTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = Math.round(s / 0.716);
  const ctx = c.getContext("2d");
  const r = 14;
  const w = c.width - 8;
  const hh = c.height - 8;
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.14;
  rr(ctx, 4, 4, w, hh, r);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#fff";
  rr(ctx, 4, 4, w, hh, r);
  ctx.stroke();
  _cardTex = new THREE.CanvasTexture(c);
  return _cardTex;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function build() {
  const rand = mulberry32(20260901);
  // a deep backdrop only — everything sits well behind the hero card (z 0) and
  // the camera (z ~12), so it reads as distance, never clutter over content
  const seeds = [];
  for (let i = 0; i < 6; i++) {
    seeds.push(
      new THREE.Vector3((rand() - 0.45) * 40, (rand() - 0.5) * 26, -22 - rand() * 30)
    );
  }
  const pos = [];
  const col = [];
  const scale = [];
  const gold = new THREE.Color("#e7b75f");
  const peri = new THREE.Color("#7e8bc4");
  for (let i = 0; i < COUNT; i++) {
    const clustered = rand() < 0.6;
    let p;
    if (clustered) {
      const s = seeds[(rand() * seeds.length) | 0];
      p = s
        .clone()
        .add(new THREE.Vector3((rand() - 0.5) * 12, (rand() - 0.5) * 10, (rand() - 0.5) * 12));
    } else {
      p = new THREE.Vector3((rand() - 0.45) * 52, (rand() - 0.5) * 34, -16 - rand() * 44);
    }
    p.z = Math.min(p.z, -14); // hard floor: nothing near the camera or hero
    pos.push(p);
    col.push(rand() < 0.24 ? peri : gold);
    scale.push(0.6 + rand() * (clustered ? 1.1 : 2.2));
  }

  // threads
  const tp = [];
  for (let k = 0; k < 20; k++) {
    const a = (rand() * COUNT) | 0;
    let b = -1;
    let best = 1e9;
    for (let t = 0; t < 12; t++) {
      const c = (rand() * COUNT) | 0;
      if (c === a) continue;
      const d = pos[a].distanceToSquared(pos[c]);
      if (d < best && d > 1.5) {
        best = d;
        b = c;
      }
    }
    if (b < 0 || best > 80) continue;
    tp.push(pos[a].x, pos[a].y, pos[a].z, pos[b].x, pos[b].y, pos[b].z);
  }

  // sparse glints
  const gl = [];
  for (let i = 0; i < 70; i++) {
    const s = seeds[(rand() * seeds.length) | 0];
    gl.push(
      s.x + (rand() - 0.5) * 16,
      s.y + (rand() - 0.5) * 12,
      Math.min(-14, s.z + (rand() - 0.5) * 14)
    );
  }

  return {
    pos,
    col,
    scale,
    threads: new Float32Array(tp),
    glints: new Float32Array(gl),
  };
}

export function ConstellationField() {
  const group = useRef();
  const mesh = useRef();
  const retreat = useRef(0);
  const data = useMemo(() => build(), []);
  const tex = useMemo(() => cardAlpha(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      dummy.position.copy(data.pos[i]);
      dummy.rotation.set(
        (i % 7) * 0.09 - 0.3,
        (i % 11) * 0.1 - 0.55,
        (i % 5) * 0.08 - 0.2
      );
      dummy.scale.setScalar(data.scale[i]);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, data.col[i]);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [data]);

  useFrame((state, dt) => {
    retreat.current = THREE.MathUtils.damp(
      retreat.current,
      fieldRetreat(atlasScroll.progress),
      2.4,
      dt
    );
    const g = group.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(
      g.rotation.y,
      state.clock.elapsedTime * 0.008 + atlasScroll.pointer.x * 0.06,
      2,
      dt
    );
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -atlasScroll.pointer.y * 0.04, 2, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, -retreat.current * 10, 2.4, dt);
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <planeGeometry args={[0.63, 0.88]} />
        <meshBasicMaterial
          alphaMap={tex}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      <lineSegments frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.threads, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          color="#7e8bc4"
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[data.glints, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          sizeAttenuation
          color="#f0d9a6"
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
