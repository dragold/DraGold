import * as THREE from "three";
import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";

// Holographic card material. Composites the real card artwork with a
// view-dependent iridescent sheen + a moving anisotropic streak. The foil
// PROFILE is keyed to the card's rarity (0 soft / 1 galaxy / 2 metallic gold),
// so the shimmer is driven by real data, not decoration. Two accents only —
// gold and periwinkle — except inside the spectral ramp, where a full hue
// sweep is physically what foil does.
const FoilMaterialImpl = shaderMaterial(
  {
    uMap: null,
    uTime: 0,
    uPointer: new THREE.Vector2(0, 0),
    uTilt: new THREE.Vector2(0, 0),
    uFoil: 1.0, // overall strength (also scrolled by velocity)
    uProfile: 0, // 0 soft | 1 galaxy | 2 metallic
    uReveal: 1.0, // 0 → 1 fade-in when the texture is ready
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    varying vec3 vNormalW;

    uniform sampler2D uMap;
    uniform float uTime;
    uniform vec2  uPointer;
    uniform vec2  uTilt;
    uniform float uFoil;
    uniform float uProfile;
    uniform float uReveal;

    // cheap hash / value noise
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
      return v;
    }
    vec3 hue(float h){
      return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }

    void main() {
      vec4 art = texture2D(uMap, vUv);

      // a "view angle" proxy from the card's tilt + the pointer, biased by uv
      vec2 ang = uTilt * 1.4 + uPointer * 0.35;
      float grad = dot(normalize(vNormalW), vec3(0.0, 0.0, 1.0));
      float fres = pow(1.0 - clamp(grad, 0.0, 1.0), 2.0);

      // spectral shimmer — hue sweeps with angle + a slow drift
      float band = vUv.x * 1.2 + vUv.y * 0.6 + ang.x * 2.2 - ang.y * 1.6 + uTime * 0.03;
      vec3 spectrum = hue(fract(band));

      // a soft anisotropic band raking across — wide and gentle, not a slash
      float streakPos = fract(vUv.x * 1.6 - vUv.y * 0.8 + ang.x * 1.8 + uTime * 0.04);
      float streak = smoothstep(0.30, 0.5, streakPos) * smoothstep(0.70, 0.5, streakPos);

      float sheen = fres * 0.4 + 0.08;

      vec3 foil = spectrum * sheen * 0.6;
      foil += spectrum * streak * (0.18 + 0.25 * fres);

      // profile
      if (uProfile > 1.5) {
        // metallic gold — collapse the spectrum toward gold
        vec3 gold = vec3(0.906, 0.718, 0.373);
        foil = mix(foil, gold * (sheen + streak * 0.5), 0.75);
      } else if (uProfile > 0.5) {
        // galaxy — fine sparkle field masked by fbm
        float g = fbm(vUv * 20.0 + ang * 2.0);
        float sparkle = smoothstep(0.80, 0.97, g) * (0.4 + 0.4 * sin(uTime * 2.5 + g * 30.0));
        foil += spectrum * sparkle * 0.5;
      }

      float strength = uFoil * (0.34 + 0.30 * fres);

      // screen-blend the foil over the artwork
      vec3 col = 1.0 - (1.0 - art.rgb) * (1.0 - foil * strength);

      // gentle vignette so the card reads as a lit object
      float vig = smoothstep(1.2, 0.42, length(vUv - 0.5));
      col *= 0.86 + 0.14 * vig;

      col = mix(vec3(0.03, 0.03, 0.045), col, uReveal);
      gl_FragColor = vec4(col, art.a);
      #include <colorspace_fragment>
    }
  `
);

extend({ FoilMaterial: FoilMaterialImpl });

export { FoilMaterialImpl as FoilMaterial };

// rarity string → profile int
export function foilProfile(rarity = "") {
  const r = rarity.toLowerCase();
  if (/gold|metal|secret/.test(r)) return 2;
  if (/special illustration|galaxy|cosmos|rainbow|hyper/.test(r)) return 1;
  return 0; // illustration rare / art rare / everything else → soft sheen
}
