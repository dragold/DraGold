import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { atlasScroll } from "./atlasScroll.js";

// Fine dust drifting in the void — gives the space depth without ever reading
// as "particles". Single draw call.
export function DustField({ count = 800 }) {
  const ref = useRef();

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 3;
      speeds[i] = 0.04 + Math.random() * 0.12;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * dt * 0.5;
      if (arr[i * 3 + 1] > 10) arr[i * 3 + 1] = -10;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.rotation.y = state.clock.elapsedTime * 0.01 + atlasScroll.pointer.x * 0.05;
    pts.position.z = -3 + atlasScroll.progress * 4;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.018}
        sizeAttenuation
        color="#c9b98f"
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
