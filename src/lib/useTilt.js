// Pointer-tracked tilt + sheen for CardObject (DraGold Visual North Star).
// Mutates the plate element's style directly (no React state) so pointermove
// stays off the render path; rAF-throttled. No-ops on touch/coarse pointers
// and under prefers-reduced-motion, per the hard motion-intensity budget.
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

  const onPointerMove = useCallback((e) => {
    const el = plateRef.current;
    if (!el || !motionAllowed(e)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const { clientX, clientY } = e;
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * 2 * max * strength;
      const rotateX = (0.5 - py) * 2 * max * strength;
      el.style.transition = "none";
      el.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      el.style.setProperty("--sheen-o", "1");
    });
  }, [max, strength]);

  const onPointerLeave = useCallback(() => {
    const el = plateRef.current;
    if (!el) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    el.style.transition = "transform var(--dur-settle) var(--ease-out)";
    el.style.transform = "rotateX(0deg) rotateY(0deg)";
    el.style.setProperty("--sheen-o", "0");
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return { plateRef, onPointerMove, onPointerLeave };
}
