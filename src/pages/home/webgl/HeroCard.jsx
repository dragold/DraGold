import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";
import { FoilMaterial, foilProfile } from "./FoilMaterial.js";

const CARD_W = 2.5;
const CARD_H = CARD_W / 0.716;
const damp = THREE.MathUtils.damp;

// Segment helper: progress 0..1 across the stage, six strata → six 1/6 windows.
function seg(p, i) {
  return THREE.MathUtils.clamp((p - i / 6) / (1 / 6), 0, 1);
}

export function HeroCard({ src, rarity, tierFoil = 1 }) {
  const group = useRef();
  const plate = useRef();
  const art = useRef();
  const mat = useRef();
  const back = useRef();

  const texture = useLoader(THREE.TextureLoader, src);
  useMemo(() => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const profile = useMemo(() => foilProfile(rarity), [rarity]);
  const target = useRef({ rx: 0, ry: 0, z: 0, foil: tierFoil, artZ: 0.03, backZ: -0.05, backY: 0 });

  useFrame((state, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    const vel = Math.min(1, Math.abs(atlasScroll.velocity) / 60);
    const t = target.current;

    // ── scroll choreography (strata 0–5) ──
    // 0→1 present, 1→2 delaminate, 2→3 sweep, 3→4 recede, 4→5 open, 5→6 reform
    const s1 = seg(p, 0), s2 = seg(p, 1), s3 = seg(p, 2),
          s4 = seg(p, 3), s5 = seg(p, 4), s6 = seg(p, 5);

    t.ry = 0.20 * s1 + 0.10 * s2 - 0.80 * s3 + 0.70 * s4 - 0.55 * s5 + 0.55 * s6;
    t.rx = -0.14 * s1 + 0.05 * s2 + 0.06 * s3 - 0.05 * s4 - 0.02 * s5 + 0.05 * s6;
    t.z = -0.3 * s1 + 0.15 * s2 + 0.1 * s3 - 3.0 * s4 + 2.0 * s5 + 1.0 * s6; // recede at History
    t.artZ = 0.03 + 1.1 * s2 - 0.9 * s4;   // art lifts clear of the plate
    t.backZ = -0.05 - 1.7 * s2 - 0.3 * s3 + 1.9 * s4; // back plane drops away
    t.backY = -1.3 * s2 - 0.25 * s3 + 1.55 * s4;
    t.foil = tierFoil * (0.75 + 0.5 * s1 + 0.35 * s3 - 0.35 * s4 + 0.45 * s6);

    // ── pointer parallax on top ──
    const pRx = -ptr.y * 0.16;
    const pRy = ptr.x * 0.22;

    const g = group.current, pl = plate.current, a = art.current, m = mat.current, b = back.current;
    if (g) {
      g.position.z = damp(g.position.z, t.z, 3, dt);
      g.rotation.y = damp(g.rotation.y, t.ry + pRy, 5, dt);
      g.rotation.x = damp(g.rotation.x, t.rx + pRx, 5, dt);
      g.position.y = damp(g.position.y, Math.sin(state.clock.elapsedTime * 0.4) * 0.05, 2, dt);
    }
    if (a) a.position.z = damp(a.position.z, t.artZ, 4, dt);
    if (b) {
      b.position.z = damp(b.position.z, t.backZ, 4, dt);
      b.position.y = damp(b.position.y, t.backY, 4, dt);
    }
    if (m) {
      m.uTime = state.clock.elapsedTime;
      m.uPointer.set(ptr.x, -ptr.y);
      m.uTilt.set(g ? g.rotation.y : 0, g ? g.rotation.x : 0);
      m.uFoil = damp(m.uFoil, t.foil + vel * 0.6, 4, dt);
      m.uProfile = profile;
      m.uReveal = damp(m.uReveal, texture ? 1 : 0, 3, dt);
    }
  });

  return (
    <group ref={group}>
      <group ref={plate}>
        {/* thickness rim — just behind the art, a hair smaller so it never haloes */}
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[CARD_W * 0.992, CARD_H * 0.994, 0.06]} />
          <meshStandardMaterial color="#080809" roughness={0.95} metalness={0} />
        </mesh>
        {/* back plane — a dark card back that drops away during delamination */}
        <mesh ref={back} position={[0, 0, -0.05]}>
          <planeGeometry args={[CARD_W * 0.98, CARD_H * 0.98]} />
          <meshStandardMaterial color="#12141b" roughness={0.55} metalness={0.15} />
        </mesh>
        {/* the foil front */}
        <mesh ref={art} position={[0, 0, 0.03]}>
          <planeGeometry args={[CARD_W, CARD_H, 1, 1]} />
          {/* eslint-disable-next-line react/no-unknown-property */}
          <foilMaterial ref={mat} uMap={texture} transparent />
        </mesh>
      </group>
    </group>
  );
}

export { CARD_W, CARD_H };
