import { useEffect } from "react";
import { atlasScroll } from "./atlasScroll.js";

// Writes atlasScroll.progress / .velocity / .pointer from real DOM scroll +
// pointer, so the WebGL scene can read them in useFrame without React state.
// One passive scroll listener + one pointermove listener. Cheap.
export function useAtlasScrollProgress(stageRef) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let lastY = window.scrollY;
    let raf = 0;

    const measure = () => {
      const rect = stage.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = -rect.top;
      atlasScroll.progress = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;
    };

    const onScroll = () => {
      const y = window.scrollY;
      atlasScroll.velocity = y - lastY;
      lastY = y;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          measure();
        });
      }
    };

    const onPointer = (e) => {
      atlasScroll.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      atlasScroll.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [stageRef]);
}
