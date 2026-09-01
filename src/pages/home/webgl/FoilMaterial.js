import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";

// Holographic card front. A real foil surface: a pointer-tracked glare, view-
// angle spectral holo bands, and a per-rarity treatment (soft / cosmos / gold).
// Inspired by simeydotme's poke-holo CSS work, ported to one GLSL pass.
// Two accents rule the palette (gold / periwinkle); the full spectrum only
// shows inside the holo, which is physically what foil does.
const FoilMaterialImpl = shaderMaterial(
  {
    uMap: null,
    uTime: 0,
    uPointer: new THREE.Vector2(0, 0),
    uTilt: new THREE.Vector2(0, 0),
    uFoil: 1.0,
    uProfile: 0, // 0 soft · 1 cosmos · 2 gold/secret
    uReveal: 1.0,
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vViewDir;

    uniform sampler2D uMap;
    uniform float uTime;
    uniform vec2  uPointer;
    uniform vec2  uTilt;
    uniform float uFoil;
    uniform float uProfile;
    uniform float uReveal;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
    }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5;} return v; }
    // hue → rgb
    vec3 hue(float h){ return clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }

    void main(){
      vec4 art = texture2D(uMap, vUv);

      float NdotV = clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
      float fres = pow(1.0 - NdotV, 2.2);
      vec2 ang = uTilt * 1.5 + uPointer * 0.4;
      vec2 pc = vUv - (0.5 + uPointer * 0.35);
      float fromCenter = clamp(length(pc) * 1.4, 0.0, 1.0);

      // ── holo — fine directional foil lines that shimmer with view angle.
      //    tight bands, low amplitude: a sheen that shifts, not a rainbow tarp ──
      float lines = vUv.y * 26.0 + vUv.x * 3.0 + ang.x * 6.0 - ang.y * 4.0;
      float line = pow(0.5 + 0.5 * sin(lines), 3.0);
      float hshift = vUv.x * 0.4 + ang.x * 1.6 + ang.y * -1.1 + uTime * 0.015;
      vec3 holo = hue(fract(hshift)) * line * (0.25 + 0.55 * fres);

      // ── pointer glare — a soft near-white highlight tracking the cursor ──
      float glare = smoothstep(0.5, 0.0, length(pc)) * (0.3 + 0.7 * fromCenter);

      // ── moving specular bar (alive at rest) ──
      float barPos = fract(vUv.x * 0.7 - vUv.y * 0.3 - uTime * 0.09 + ang.x * 0.4);
      float bar = smoothstep(0.05, 0.0, abs(barPos - 0.5)) * (0.25 + 0.45 * fres);

      vec3 foil = holo + vec3(bar * 0.9) * vec3(1.0, 0.97, 0.88);
      float weight = 0.22;

      if (uProfile > 1.5) {
        // gold / secret — angular warm sheen
        vec3 gold = vec3(0.94, 0.78, 0.44);
        float facets = step(0.5, fract((vUv.x + vUv.y) * 6.0 + ang.x * 3.0));
        float sheen = mix(0.2, 1.0, facets) * (0.25 + 0.8 * fres);
        foil = mix(foil, gold * (sheen + bar), 0.8);
        weight = 0.32;
      } else if (uProfile > 0.5) {
        // cosmos — fine twinkle over the sheen
        float g = fbm(vUv * 24.0 + ang * 3.0);
        float twk = smoothstep(0.82, 0.97, g) * (0.4 + 0.6 * sin(uTime * 3.0 + g * 40.0));
        foil += holo * twk * 0.8 + twk * 0.12;
        weight = 0.26;
      }

      foil += glare * vec3(0.9, 0.88, 0.8) * 0.5;

      float strength = uFoil * weight * (0.7 + 0.5 * fres);
      vec3 col = 1.0 - (1.0 - art.rgb) * (1.0 - foil * strength);

      // grounding vignette
      float vig = smoothstep(1.25, 0.4, length(vUv - 0.5));
      col *= 0.9 + 0.1 * vig;

      col = mix(vec3(0.03, 0.03, 0.045), col, uReveal);
      gl_FragColor = vec4(col, art.a * uReveal);
      #include <colorspace_fragment>
    }
  `
);

extend({ FoilMaterial: FoilMaterialImpl });
export { FoilMaterialImpl as FoilMaterial };

// rarity string → treatment
export function foilProfile(rarity = "") {
  const r = rarity.toLowerCase();
  if (/gold|metal|secret|rainbow|hyper/.test(r)) return 2;
  if (/special illustration|cosmos|galaxy|amazing/.test(r)) return 1;
  return 0;
}
