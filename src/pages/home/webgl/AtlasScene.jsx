import { Suspense } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { HeroCard } from "./HeroCard.jsx";
import { DustField } from "./DustField.jsx";
import { atlasScroll } from "./atlasScroll.js";

const damp = THREE.MathUtils.damp;

// The card lives on the right ~third of the screen (where the DOM specimen
// was). Camera stays centred on the origin so the card sits right-of-centre;
// it only dollies slightly and parallaxes to the pointer. The big camera
// moves (timeline rail, constellation) are Phase 5.
const CARD_X = 2.15;

function Rig() {
  const { camera } = useThree();
  useFrame((_, dt) => {
    const p = atlasScroll.progress;
    const ptr = atlasScroll.pointer;
    camera.position.x = damp(camera.position.x, ptr.x * 0.22, 3, dt);
    camera.position.y = damp(camera.position.y, -ptr.y * 0.18, 3, dt);
    camera.position.z = damp(camera.position.z, 10 - p * 1.1, 3, dt);
    camera.lookAt(0.5, 0, 0);
  });
  return null;
}

export function AtlasScene({ src, rarity, config }) {
  return (
    <>
      <color attach="background" args={["#08090c"]} />
      <fog attach="fog" args={["#08090c", 10, 19]} />

      {/* directional light from behind the card — the North Star's one rule */}
      <spotLight
        position={[CARD_X + 0.6, 1.6, -4]}
        target-position={[CARD_X, 0, 0]}
        angle={0.7}
        penumbra={1}
        intensity={42}
        color="#f3e1b8"
        distance={20}
      />
      <ambientLight intensity={0.3} />
      <pointLight position={[-4, 1.5, 5]} intensity={16} color="#7e8bc4" distance={18} />
      <pointLight position={[CARD_X + 2, -0.6, 2.5]} intensity={8} color="#e7b75f" distance={10} />

      <Backlight x={CARD_X} />

      <DustField count={config.dust} />

      {/* contact shadow so the card reads as an object above a surface */}
      <mesh position={[CARD_X + 0.1, -2.9, 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 4]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
          fragmentShader={`varying vec2 vUv; void main(){ float d=length((vUv-0.5)*vec2(1.0,1.6)); gl_FragColor=vec4(0.0,0.0,0.0, smoothstep(0.5,0.05,d)*0.55); }`}
        />
      </mesh>

      <Suspense fallback={null}>
        {src && (
          <group position={[CARD_X, 0.4, 0]}>
            <HeroCard src={src} rarity={rarity} tierFoil={config.foil} />
          </group>
        )}
      </Suspense>

      <Rig />
    </>
  );
}

function Backlight({ x }) {
  // a sprite-ish soft glow: a plane with a radial-alpha material, always facing
  const ref = { current: null };
  return (
    <mesh position={[x + 0.15, 0.5, -3.2]} ref={ref}>
      <planeGeometry args={[7, 8]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{ uColor: { value: new THREE.Color("#e7b75f") } }}
        vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
        fragmentShader={`
          varying vec2 vUv; uniform vec3 uColor;
          void main(){
            float d = length((vUv - 0.5) * vec2(1.1, 1.0));
            float a = smoothstep(0.5, 0.08, d) * 0.28;
            gl_FragColor = vec4(uColor, a);
          }`}
      />
    </mesh>
  );
}
