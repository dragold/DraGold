// Decide how much WebGL to run. 0 = none (DOM CSS Atlas stays), 1 = mid
// (no heavy effects, dpr capped low), 2 = full. Cheap synchronous checks only —
// no benchmark frame, so first paint is never delayed.
export function detectTier() {
  if (typeof window === "undefined") return 0;

  const mq = window.matchMedia;
  if (mq?.("(prefers-reduced-motion: reduce)").matches) return 0;
  if (mq?.("(pointer: coarse)").matches) return 0; // phones/tablets → CSS Atlas
  if (window.innerWidth < 1024) return 0;

  // WebGL2 available?
  let gl = null;
  try {
    const c = document.createElement("canvas");
    gl = c.getContext("webgl2") || c.getContext("webgl");
  } catch {
    return 0;
  }
  if (!gl) return 0;

  // Renderer string — bail on obviously weak / software paths.
  let renderer = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
  } catch {
    /* blocked — fall through */
  }
  const r = renderer.toLowerCase();
  if (/swiftshader|software|llvmpipe|microsoft basic|angle \(google/i.test(r) && !/direct3d|metal|vulkan/i.test(r)) {
    return 1;
  }

  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 4) return 1;

  return 2;
}

// Per-tier render knobs.
export const TIER_CONFIG = {
  1: { dpr: [1, 1.25], dust: 260, foil: 0.7, postfx: false },
  2: { dpr: [1, 1.75], dust: 900, foil: 1.0, postfx: true },
};
