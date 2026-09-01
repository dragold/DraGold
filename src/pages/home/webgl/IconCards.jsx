import { useEffect, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";
import { webglImage } from "./webglImage.js";

// The recognisable cards in the constellation — real catalog rows, loaded
// tolerantly (a texture that fails to load is simply skipped, never throws).
// Kept small, low-contrast and deep so they read as "a card you know is out
// there", not a poster.
export function IconCards({ icons = [] }) {
  const group = useRef();
  const [loaded, setLoaded] = useState([]);

  const slots = useMemo(() => {
    const rand = mulberry32(4242);
    return Array.from({ length: 12 }, () => {
      // deep and off to the sides — never in the camera→hero corridor or the
      // left content column
      const side = rand() < 0.4 ? -1 : 1;
      return {
        pos: new THREE.Vector3(
          side * (12 + rand() * 16),
          (rand() - 0.5) * 16,
          -16 - rand() * 24
        ),
        rot: (rand() - 0.5) * 0.7,
        scale: 1.6 + rand() * 2.0,
        phase: rand() * 6.28,
      };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const out = [];
    let pending = 0;
    icons.slice(0, 12).forEach((card, i) => {
      const url = webglImage(card);
      if (!url) return;
      pending++;
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          out.push({ tex, slot: slots[i % slots.length] });
          if (--pending === 0 && alive) setLoaded(out.slice());
          else if (alive) setLoaded(out.slice());
        },
        undefined,
        () => {
          if (--pending === 0 && alive) setLoaded(out.slice());
        }
      );
    });
    return () => {
      alive = false;
    };
  }, [icons, slots]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(
      g.rotation.y,
      state.clock.elapsedTime * 0.006 + atlasScroll.pointer.x * 0.05,
      2,
      dt
    );
  });

  return (
    <group ref={group}>
      {loaded.map(({ tex, slot }, i) => (
        <group
          key={i}
          position={slot.pos}
          rotation={[0, slot.rot, 0]}
          scale={slot.scale}
        >
          <mesh>
            <planeGeometry args={[0.63, 0.88]} />
            <meshBasicMaterial
              map={tex}
              transparent
              opacity={0.55}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          {/* faint halo */}
          <mesh position={[0, 0, -0.02]} scale={1.5}>
            <planeGeometry args={[0.63, 0.88]} />
            <meshBasicMaterial
              color="#e7b75f"
              transparent
              opacity={0.05}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
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
