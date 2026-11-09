import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";
import { webglImage } from "./webglImage.js";
import { generateCardBurst } from "./cardBurst.pure.js";

// ── The card explosion ──────────────────────────────────────────────────
// Real catalog cards drifting through the space around the hero, in three
// depth bands. At the top of the page they're spread wide and alive; as the
// hero scrolls away (atlasScroll.heroExit → 1) they draw inward and settle
// toward the constellation, handing the stage to the descent.
//
// One shared render loop (the R3F frameloop). Textures load tolerantly — a
// CORS/404 failure just leaves that slot empty, never throws. Supersedes the
// old IconCards layer.

const GEO = new THREE.PlaneGeometry(0.63, 0.88);
const damp = THREE.MathUtils.damp;

export function CardBurst({ cards = [], max = 33 }) {
  const group = useRef();
  const [textures, setTextures] = useState([]); // [{tex}]
  const ease = useRef(0); // damped heroExit

  // load up to 18 real card textures (round-robined across the slots)
  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const urls = [];
    for (const c of cards) {
      const u = webglImage(c);
      if (u && !urls.includes(u)) urls.push(u);
      if (urls.length >= 18) break;
    }
    const out = [];
    let pending = urls.length;
    if (!pending) return;
    urls.forEach((url) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          out.push({ tex });
          if (alive && --pending <= 0) setTextures(out.slice());
          else if (alive) setTextures(out.slice());
        },
        undefined,
        () => {
          if (alive && --pending <= 0) setTextures(out.slice());
        },
      );
    });
    return () => {
      alive = false;
      out.forEach(({ tex }) => tex.dispose());
    };
  }, [cards]);

  const slots = useMemo(() => {
    const all = generateCardBurst({ available: Math.max(1, textures.length) });
    // tier cap: keep foreground whole, trim the deeper bands first
    if (all.length <= max) return all;
    const fg = all.filter((s) => s.band === "foreground");
    const rest = all.filter((s) => s.band !== "foreground").slice(0, max - fg.length);
    return fg.concat(rest);
  }, [textures.length, max]);

  const items = useMemo(
    () =>
      slots.map((s) => ({
        s,
        cross: s.band !== "foreground" && (s.phase * 1000) % 7 < 1, // ~1 in 7 drifts across
      })),
    [slots],
  );

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const T = state.clock.elapsedTime;
    const { pointer } = atlasScroll;
    ease.current = damp(ease.current, atlasScroll.heroExit, 3, dt);
    const e = ease.current; // 0 spread → 1 gathered

    for (let i = 0; i < g.children.length; i++) {
      const o = g.children[i];
      const s = o.userData.s;
      if (!s) continue;

      // bob + slow diagonal drift
      const bob = Math.sin(T * s.drift + s.phase) * s.driftAmp;
      const cross = o.userData.cross
        ? { x: Math.sin(T * 0.03 + s.phase) * 4.5, y: Math.cos(T * 0.024 + s.phase) * 2.2 }
        : { x: 0, y: 0 };

      // gather toward the constellation as the hero leaves: pull to ~35% of
      // spread and push deep; foreground also fades out
      const gx = s.x * (1 - e * 0.65) + cross.x * (1 - e);
      const gy = (s.y + bob) * (1 - e * 0.5) + cross.y * (1 - e);
      const gz = s.z - e * 14;

      const par = s.band === "foreground" ? 0.55 : s.band === "midground" ? 0.3 : 0.12;
      o.position.x = damp(o.position.x, gx + pointer.x * par, 3, dt);
      o.position.y = damp(o.position.y, gy - pointer.y * par * 0.7, 3, dt);
      o.position.z = damp(o.position.z, gz, 3, dt);

      o.rotation.y = damp(o.rotation.y, s.tilt + pointer.x * 0.05 + Math.sin(T * 0.2 + s.phase) * 0.03, 3, dt);
      o.rotation.z = damp(o.rotation.z, s.rot + Math.sin(T * 0.15 + s.phase) * 0.02, 3, dt);

      const mat = o.children[0]?.material;
      if (mat) {
        const fade = s.band === "foreground" ? 1 - e : 1 - e * 0.4;
        mat.opacity = damp(mat.opacity, Math.max(0, s.opacity * fade), 3, dt);
      }
    }

    g.rotation.y = damp(g.rotation.y, atlasScroll.pointer.x * 0.03, 2, dt);
  });

  if (!textures.length) return null;

  return (
    <group ref={group}>
      {items.map(({ s, cross }, i) => {
        const t = textures[s.idx % textures.length];
        if (!t) return null;
        return (
          <group
            key={i}
            position={[s.x, s.y, s.z]}
            rotation={[0, s.tilt, s.rot]}
            scale={s.scale}
            userData={{ s, cross }}
          >
            <mesh geometry={GEO}>
              <meshBasicMaterial
                map={t.tex}
                transparent
                opacity={s.opacity}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {s.gold && (
              <mesh geometry={GEO} position={[0, 0, -0.03]} scale={1.5}>
                <meshBasicMaterial
                  color="#e7b75f"
                  transparent
                  opacity={0.06}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
