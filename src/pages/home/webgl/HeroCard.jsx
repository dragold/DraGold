import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";
import { FoilMaterial, foilProfile } from "./FoilMaterial.js";
import { cardBackTexture } from "./cardBackTexture.js";

const CARD_W = 2.5;
const CARD_H = CARD_W / 0.716;
const CARD_T = 0.055; // real thickness — you see the edge when it turns
const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;
const seg = (p, i) => clamp((p - i / 6) / (1 / 6), 0, 1);

// One holographic collectible, inspected. It turns under the light as you
// descend — face → three-quarter → edge → face — never comes apart. The
// knowledge unfolds beside it in the DOM; the card is the constant.
export function HeroCard({ src, rarity, tierFoil = 1 }) {
  const group = useRef();
  const card = useRef();
  const foilMat = useRef();

  const artTex = useLoader(THREE.TextureLoader, src);
  useMemo(() => {
    if (!artTex) return;
    artTex.colorSpace = THREE.SRGBColorSpace;
    artTex.anisotropy = 8;
  }, [artTex]);
  const backTex = useMemo(() => cardBackTexture(), []);
  const profile = useMemo(() => foilProfile(rarity), [rarity]);

  const t = useRef({ ry: 0, rx: 0, rz: 0, z: 0, y: 0, foil: tierFoil });

  useFrame((state, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    const vel = Math.min(1, Math.abs(atlasScroll.velocity) / 55);
    const T = state.clock.elapsedTime;
    const tg = t.current;

    const s1 = seg(p, 0), s2 = seg(p, 1), s3 = seg(p, 2),
          s4 = seg(p, 3), s5 = seg(p, 4), s6 = seg(p, 5);

    // a controlled, weighty turn through the strata (radians) — the artwork
    // stays readable (max ~35° through Set/Print), then flips to the DraGold
    // back as it joins the constellation
    const turn =
      0.16 * s1 + 0.18 * s2 + 0.24 * s3 - 0.5 * s4 - 0.3 * s5 + s6 * 2.9;
    const pitch =
      -0.09 * s1 + 0.03 * s2 + 0.02 * s3 - 0.02 * s4 + 0.03 * s6;

    // idle life at the top; pointer parallax everywhere
    const idle = 1 - Math.max(s1, s2, s3, s4);
    tg.ry = turn + ptr.x * 0.18 + Math.sin(T * 0.32) * 0.05 * idle;
    tg.rx = pitch - ptr.y * 0.13 + Math.cos(T * 0.26) * 0.03 * idle;
    tg.rz = Math.sin(T * 0.2) * 0.015 * idle - s4 * 0.05;

    // recede at History, join the field at Collection
    tg.z = -0.2 * s1 - 3.4 * s4 + 2.3 * s5 + 1.0 * s6;
    tg.y = Math.sin(T * 0.5) * 0.06 * idle - 0.05 * s2;

    tg.foil = tierFoil * (0.72 + 0.5 * s1 + 0.35 * s3 - 0.25 * s4 + 0.4 * s6);

    const g = group.current, c = card.current;
    if (g) {
      g.position.z = damp(g.position.z, tg.z, 3.2, dt);
      g.position.y = damp(g.position.y, tg.y, 2.6, dt);
    }
    if (c) {
      c.rotation.y = damp(c.rotation.y, tg.ry, 4.5, dt);
      c.rotation.x = damp(c.rotation.x, tg.rx, 4.5, dt);
      c.rotation.z = damp(c.rotation.z, tg.rz, 4, dt);
    }
    const fm = foilMat.current;
    if (fm) {
      fm.uTime = T;
      fm.uPointer.set(ptr.x, -ptr.y);
      fm.uTilt.set(c ? c.rotation.y : 0, c ? c.rotation.x : 0);
      fm.uFoil = damp(fm.uFoil, tg.foil + vel * 0.5, 4, dt);
      fm.uProfile = profile;
      fm.uReveal = damp(fm.uReveal, artTex ? 1 : 0, 3, dt);
    }
  });

  return (
    <group ref={group}>
      <mesh ref={card}>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        <meshStandardMaterial attach="material-0" color="#0b0c11" roughness={0.85} />
        <meshStandardMaterial attach="material-1" color="#0b0c11" roughness={0.85} />
        <meshStandardMaterial attach="material-2" color="#0b0c11" roughness={0.85} />
        <meshStandardMaterial attach="material-3" color="#0b0c11" roughness={0.85} />
        {/* front — holographic foil over the artwork */}
        {/* eslint-disable-next-line react/no-unknown-property */}
        <foilMaterial ref={foilMat} attach="material-4" uMap={artTex} toneMapped={false} />
        {/* back — the DraGold card back */}
        <meshStandardMaterial attach="material-5" map={backTex} roughness={0.6} metalness={0.08} />
      </mesh>
      {/* grounded contact shadow travels with the card */}
      <mesh position={[0, -CARD_H / 2 - 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD_W * 1.5, CARD_W * 1.2]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
          fragmentShader={`varying vec2 vUv;void main(){float d=length((vUv-0.5)*vec2(1.0,1.5));gl_FragColor=vec4(0.0,0.0,0.0,smoothstep(0.5,0.05,d)*0.5);}`}
        />
      </mesh>
    </group>
  );
}

export { CARD_W, CARD_H };
