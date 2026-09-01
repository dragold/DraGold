import { Suspense, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HeroCard } from "./HeroCard.jsx";
import { DustField } from "./DustField.jsx";
import { ConstellationField } from "./ConstellationField.jsx";
import { IconCards } from "./IconCards.jsx";
import { atlasScroll } from "./atlasScroll.js";

const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;
const seg = (p, i) => clamp((p - i / 6) / (1 / 6), 0, 1);
const bell = (x) => Math.sin(clamp(x, 0, 1) * Math.PI);

const CARD_X = 2.7;

// Camera: calm on the right at rest, a small push at Identity, then a real
// ARC during the Set stratum — it swings wide and lifts to look into the
// opening laminate from three-quarters, then settles. Big moves (timeline
// rail, constellation) are Phase 5.
function Rig() {
  const { camera } = useThree();
  const look = new THREE.Vector3(0.9, 0, 0);
  useFrame((_, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    const s1 = seg(p, 0), s3 = seg(p, 2),
          s4 = seg(p, 3), s5 = seg(p, 4), s6 = seg(p, 5);

    // gentle dolly in · a slight drift at Set/Print · lateral traverse at
    // History · pull all the way back into the constellation at Collection
    const tx =
      ptr.x * 0.28 + s1 * 0.45 + s3 * 0.6 + s4 * 3.2 - s5 * 1.4 - s6 * 2.0;
    const ty = -ptr.y * 0.18 + s4 * 0.5 + s6 * 1.3;
    const tz =
      12.6 - s1 * 1.6 - s3 * 0.4 + s4 * 1.8 + s6 * 9.5;

    camera.position.x = damp(camera.position.x, tx, 2.4, dt);
    camera.position.y = damp(camera.position.y, ty, 2.4, dt);
    camera.position.z = damp(camera.position.z, tz, 2.4, dt);

    const roll = s4 * 0.05;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);

    look.set(0.9 - s4 * 1.1 - s6 * 0.5, -s4 * 0.2, s4 * -3);
    camera.lookAt(look);
  });
  return null;
}


export function AtlasScene({ src, rarity, config, icons }) {
  return (
    <>
      <color attach="background" args={["#08090c"]} />
      <fog attach="fog" args={["#08090c", 13, 34]} />

      {/* KEY — directional, from behind the card (the North Star's one rule) */}
      <spotLight
        position={[CARD_X + 0.4, 2.0, -4.5]}
        target-position={[CARD_X, 0, 0]}
        angle={0.7}
        penumbra={1}
        intensity={55}
        color="#f6e6c0"
        distance={22}
        castShadow={false}
      />
      {/* RIM — straight behind, traces the silhouette / edge thickness */}
      <pointLight position={[CARD_X, 0.2, -2.2]} intensity={9} color="#ffffff" distance={7} />
      {/* FILL — cool periwinkle from front-left */}
      <pointLight position={[-4, 1.2, 6]} intensity={16} color="#7e8bc4" distance={20} />
      {/* WARM kick from front-right, low */}
      <pointLight position={[CARD_X + 2.4, -1.2, 3]} intensity={7} color="#e7b75f" distance={9} />
      <ambientLight intensity={0.26} />

      <RovingLight x={CARD_X} />
      <Backlight x={CARD_X} />

      <ConstellationField />
      {config.dust > 300 && <IconCards icons={icons} />}
      <DustField count={config.dust} />

      <Suspense fallback={null}>
        {src && (
          <group position={[CARD_X, 0.55, 0]}>
            <HeroCard src={src} rarity={rarity} tierFoil={config.foil} />
          </group>
        )}
      </Suspense>

      <Rig />
    </>
  );
}

// A soft moving accent that orbits the card — makes the foil catch light like
// real holo turning under a lamp.
function RovingLight({ x }) {
  const ref = useRef();
  useFrame((state) => {
    const l = ref.current;
    if (!l) return;
    const t = state.clock.elapsedTime;
    l.position.x = x + Math.sin(t * 0.5) * 2.2;
    l.position.y = 0.4 + Math.cos(t * 0.37) * 1.4;
    l.position.z = 1.8 + Math.sin(t * 0.29) * 1.0;
  });
  return <pointLight ref={ref} color="#fff4dc" distance={7} intensity={14} />;
}

function Backlight({ x }) {
  return (
    <mesh position={[x + 0.1, 0.35, -3.0]}>
      <planeGeometry args={[6.0, 7.0]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color("#e7b75f") } }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          varying vec2 vUv; uniform vec3 uColor;
          void main(){
            float d = length((vUv - 0.5) * vec2(1.15, 1.0));
            gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * 0.17);
          }`}
      />
    </mesh>
  );
}

