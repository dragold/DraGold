// IntersectionObserver-based reveal-on-scroll with stagger index support
// (DraGold Visual North Star, motion budget: 700ms max, one-shot per element).
import { useRef, useState, useEffect } from "react";

export function useReveal(index = 0) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return {
    ref,
    className: `reveal${revealed ? " reveal-in" : ""}`,
    style: { transitionDelay: `${index * 60}ms` },
  };
}
