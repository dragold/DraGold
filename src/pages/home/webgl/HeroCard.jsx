import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";
import { FoilMaterial, foilProfile } from "./FoilMaterial.js";
import { cardBackTexture } from "./cardBackTexture.js";

const CARD_W = 2.5;
const CARD_H = CARD_W / 0.716;
const CORE_T = 0.1; // real cardstock thickness
const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

// segment progress: 6 strata → six 1/6 windows of overall scroll
const seg = (p, i) => clamp((p - i / 6) / (1 / 6), 0, 1);
// smooth bell (0→1→0) for a transient move that resolves
const bell = (x) => Math.sin(clamp(x, 0, 1) * Math.PI);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function HeroCard({ src, rarity, tierFoil = 1 }) {
  const group = useRef();
  const plate = useRef();
  const foil = useRef();
  const foilMat = useRef();
  const artL = useRef();
  const coreL = useRef();
  const backL = useRef();

  const artTex = useLoader(THREE.TextureLoader, src);
  useMemo(() => {
    if (!artTex) return;
    artTex.colorSpace = THREE.SRGBColorSpace;
    artTex.anisotropy = 8;
  }, [artTex]);
  const backTex = useMemo(() => cardBackTexture(), []);
  const profile = useMemo(() => foilProfile(rarity), [rarity]);

  const FRONT = CORE_T / 2 + 0.004; // just in front of the cardstock face
  const t = useRef({
    gz: 0, gy: 0, ry: 0, rx: 0, pRy: 0, pRx: 0, sep: 0, foil: tierFoil,
    foilZ: FRONT + 0.006, artZ: FRONT, coreZ: 0, backZ: -FRONT,
    foilRZ: 0, artRZ: 0, backRZ: 0, foilY: 0, backY: 0,
  });

  useFrame((state, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    const vel = Math.min(1, Math.abs(atlasScroll.velocity) / 55);
    const T = state.clock.elapsedTime;
    const tg = t.current;

    const s1 = seg(p, 0), s2 = seg(p, 1), s3 = seg(p, 2),
          s4 = seg(p, 3), s5 = seg(p, 4), s6 = seg(p, 5);

    // ── the opening: Set stratum delaminates the laminate ──
    const open = easeInOut(s2) * (1 - 0.55 * s3); // spreads, then eases back a touch
    tg.sep = open;

    // per-layer separation along local +z (they spread from the cardstock core)
    tg.foilZ = FRONT + 0.006 + 1.7 * open;
    tg.artZ  = FRONT + 0.85 * open;
    tg.coreZ = 0.0;
    tg.backZ = -FRONT - 0.75 * open;

    // fan — each layer a few degrees off + a little drift, so it reads as a
    // spreading hand of cards, not a rigid accordion
    tg.foilRZ = 0.06 * open;
    tg.artRZ  = -0.035 * open;
    tg.backRZ = 0.08 * open;
    tg.foilY  = 0.16 * open;
    tg.backY  = -0.22 * open;

    // plate attitude through the descent
    const setTilt = bell(s2) * 0.9;
    tg.ry =
      0.16 * s1 + setTilt * 0.55 - 0.72 * s3 + 0.66 * s4 - 0.5 * s5 + 0.5 * s6;
    tg.rx =
      -0.12 * s1 - setTilt * 0.28 + 0.05 * s3 - 0.04 * s4 - 0.02 * s5 + 0.05 * s6;

    // z (toward/away from camera) — card recedes to a point at History, returns
    tg.gz = -0.15 * s1 + 0.25 * bell(s2) - 3.1 * s4 + 2.1 * s5 + 1.0 * s6;

    // pointer parallax + a slow living drift at rest
    const idle = 1 - Math.max(s1, s2, s3, s4);
    tg.pRy = ptr.x * 0.16 + Math.sin(T * 0.35) * 0.05 * idle;
    tg.pRx = -ptr.y * 0.12 + Math.cos(T * 0.27) * 0.03 * idle;
    tg.gy = Math.sin(T * 0.5) * 0.06 * idle - 0.05 * bell(s2);

    tg.foil = tierFoil * (0.7 + 0.55 * s1 + 0.4 * s3 - 0.3 * s4 + 0.45 * s6);

    // ── apply (damped) ──
    const g = group.current, pl = plate.current;
    if (g) {
      g.position.z = damp(g.position.z, tg.gz, 3.2, dt);
      g.position.y = damp(g.position.y, tg.gy, 2.6, dt);
      g.rotation.y = damp(g.rotation.y, tg.ry + tg.pRy, 5, dt);
      g.rotation.x = damp(g.rotation.x, tg.rx + tg.pRx, 5, dt);
    }
    const applyLayer = (ref, z, rz, y) => {
      const m = ref.current;
      if (!m) return;
      m.position.z = damp(m.position.z, z, 4.5, dt);
      m.position.y = damp(m.position.y, y, 4.5, dt);
      m.rotation.z = damp(m.rotation.z, rz, 4.5, dt);
    };
    applyLayer(foil, tg.foilZ, tg.foilRZ, tg.foilY);
    applyLayer(artL, tg.artZ, tg.artRZ, 0);
    applyLayer(coreL, tg.coreZ, 0, 0);
    applyLayer(backL, tg.backZ, tg.backRZ, tg.backY);

    const fm = foilMat.current;
    if (fm) {
      fm.uTime = T;
      fm.uPointer.set(ptr.x, -ptr.y);
      fm.uTilt.set(g ? g.rotation.y : 0, g ? g.rotation.x : 0);
      fm.uFoil = damp(fm.uFoil, tg.foil + vel * 0.5, 4, dt);
      fm.uProfile = profile;
      fm.uSeparation = damp(fm.uSeparation, tg.sep, 4, dt);
      fm.uReveal = damp(fm.uReveal, artTex ? 1 : 0, 3, dt);
    }
  });

  return (
    <group ref={group}>
      <group ref={plate}>
        {/* cardstock core — real thickness. Warm ivory only on the exposed EDGE;
            the face is deep ink so the exploded slab reads as "the card body",
            not a bright blank rectangle competing with the artwork. */}
        <mesh ref={coreL}>
          <boxGeometry args={[CARD_W, CARD_H, CORE_T]} />
          <meshStandardMaterial attach="material-0" color="#d8ccb0" roughness={0.96} />
          <meshStandardMaterial attach="material-1" color="#d8ccb0" roughness={0.96} />
          <meshStandardMaterial attach="material-2" color="#d8ccb0" roughness={0.96} />
          <meshStandardMaterial attach="material-3" color="#d8ccb0" roughness={0.96} />
          <meshStandardMaterial attach="material-4" color="#101118" roughness={0.9} />
          <meshStandardMaterial attach="material-5" color="#101118" roughness={0.9} />
        </mesh>

        {/* printed back */}
        <mesh ref={backL} position={[0, 0, -FRONT]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[CARD_W * 0.985, CARD_H * 0.99]} />
          <meshStandardMaterial map={backTex} roughness={0.62} metalness={0.08} />
        </mesh>

        {/* printed artwork */}
        <mesh ref={artL} position={[0, 0, FRONT]}>
          <planeGeometry args={[CARD_W * 0.985, CARD_H * 0.99]} />
          <meshBasicMaterial map={artTex} toneMapped={false} />
        </mesh>

        {/* holographic foil — laminated at rest, a floating film when opened */}
        <mesh ref={foil} position={[0, 0, FRONT + 0.006]}>
          <planeGeometry args={[CARD_W, CARD_H, 1, 1]} />
          {/* eslint-disable-next-line react/no-unknown-property */}
          <foilMaterial ref={foilMat} uMap={artTex} transparent depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export { CARD_W, CARD_H };
