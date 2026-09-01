// Pointer-tracked holographic card interaction. Technique adapted from
// simeydotme's poke-holo (MIT) — real-foil behaviour: the card rotates toward
// the pointer, a radial glare tracks the cursor, and the holo gradient shifts
// with a "distance from centre" intensity. rAF-throttled, no React state.
// No-ops on touch/coarse pointers and under prefers-reduced-motion.
import { useRef, useCallback, useEffect } from "react";

function motionAllowed(e) {
  if (e?.pointerType === "touch") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}

export function useTilt({ max = 7, strength = 1 } = {}) {
  const plateRef = useRef(null);
  const rafRef = useRef(null);
  const easeRef = useRef(null);

  const set = useCallback((el, px, py) => {
    // px, py in 0..1 across the element
    const cx = px - 0.5;
    const cy = py - 0.5;
    const fromCenter = Math.min(1, Math.hypot(cx, cy) * 2);
    const rotateY = cx * 2 * max * strength;
    const rotateX = -cy * 2 * max * strength;

    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.setProperty("--pfc", fromCenter.toFixed(3));
    el.style.setProperty("--rx", `${rotateX.toFixed(2)}deg`);
    el.style.setProperty("--ry", `${rotateY.toFixed(2)}deg`);
    // holo gradient offset — a wider travel than the pointer so the foil
    // "moves" convincingly
    el.style.setProperty("--bg-x", `${(35 + cx * 90).toFixed(1)}%`);
    el.style.setProperty("--bg-y", `${(35 + cy * 90).toFixed(1)}%`);
    el.style.setProperty("--foil-angle", `${(115 + rotateY * 3).toFixed(1)}deg`);
    el.style.setProperty("--sheen-o", "1");
    el.style.transition = "none";
    el.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, [max, strength]);

  const onPointerMove = useCallback((e) => {
    const el = plateRef.current;
    if (!el || !motionAllowed(e)) return;
    if (easeRef.current) { cancelAnimationFrame(easeRef.current); easeRef.current = null; }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const { clientX, clientY } = e;
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      set(el, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
    });
  }, [set]);

  const onPointerLeave = useCallback(() => {
    const el = plateRef.current;
    if (!el) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // ease the holo/glare back to centre over ~600ms, then release
    const start = performance.now();
    const from = {
      pfc: parseFloat(el.style.getPropertyValue("--pfc")) || 0,
    };
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 600);
      const k = 1 - Math.pow(1 - t, 3);
      const pfc = from.pfc * (1 - k);
      el.style.setProperty("--pfc", pfc.toFixed(3));
      el.style.setProperty("--sheen-o", (1 - k).toFixed(3));
      if (t < 1) {
        easeRef.current = requestAnimationFrame(tick);
      } else {
        el.style.setProperty("--mx", "50%");
        el.style.setProperty("--my", "50%");
        el.style.setProperty("--bg-x", "35%");
        el.style.setProperty("--bg-y", "35%");
        el.style.setProperty("--foil-angle", "115deg");
      }
    };
    el.style.transition = "transform var(--dur-settle) var(--ease-out)";
    el.style.transform = "rotateX(0deg) rotateY(0deg)";
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    easeRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (easeRef.current) cancelAnimationFrame(easeRef.current);
  }, []);

  return { plateRef, onPointerMove, onPointerLeave };
}
