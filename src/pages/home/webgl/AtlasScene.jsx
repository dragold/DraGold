import { Suspense, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HeroCard } from "./HeroCard.jsx";
import { DustField } from "./DustField.jsx";
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
  const look = new THREE.Vector3(0.55, 0, 0);
  useFrame((_, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    const s1 = seg(p, 0), s2 = seg(p, 1);
    const arc = bell(s2);

    const tx = ptr.x * 0.26 + s1 * 0.5 + arc * 1.05;
    const ty = -ptr.y * 0.16 + arc * 0.55;
    const tz = 12.4 - s1 * 1.4 + arc * 2.9 - Math.max(0, p - 0.33) * 1.2;

    camera.position.x = damp(camera.position.x, tx, 2.6, dt);
    camera.position.y = damp(camera.position.y, ty, 2.6, dt);
    camera.position.z = damp(camera.position.z, tz, 2.6, dt);

    look.set(0.9 + arc * 0.7, -arc * 0.3, 0);
    camera.lookAt(look);
  });
  return null;
}

export function AtlasScene({ src, rarity, config }) {
  return (
    <>
      <color attach="background" args={["#08090c"]} />
      <fog attach="fog" args={["#08090c", 11, 22]} />

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

      <RakingLight x={CARD_X} />
      <Backlight x={CARD_X} />
      <ContactShadow x={CARD_X} />

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

// A hard, moving light that rakes through the gaps between the layers while the
// card is open — this is what makes the separation read as physical.
function RakingLight({ x }) {
  const ref = useRef();
  useFrame((state) => {
    const l = ref.current;
    if (!l) return;
    const s2 = seg(atlasScroll.progress, 1);
    l.intensity = bell(s2) * 40;
    l.position.x = x + Math.sin(state.clock.elapsedTime * 0.9) * 1.4;
    l.position.y = 0.6 + Math.cos(state.clock.elapsedTime * 0.7) * 0.8;
  });
  return <pointLight ref={ref} position={[x, 0.6, 1.6]} color="#fff4dc" distance={6} intensity={0} />;
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

function ContactShadow({ x }) {
  return (
    <mesh position={[x + 0.1, -2.7, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[4.6, 3.8]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`varying vec2 vUv; void main(){ float d=length((vUv-0.5)*vec2(1.0,1.7)); gl_FragColor=vec4(0.0,0.0,0.0, smoothstep(0.5,0.04,d)*0.5); }`}
      />
    </mesh>
  );
}
