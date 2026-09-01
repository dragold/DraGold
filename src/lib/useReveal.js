// IntersectionObserver-based reveal-on-scroll with stagger index support
// (DraGold Visual North Star, motion budget: 700ms max, one-shot per element).
import { useRef, useState, useEffect } from "react";

export function useReveal(opts = 0) {
  const { index = 0, once = true } =
    typeof opts === "number" ? { index: opts } : (opts || {});
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
    // threshold:0 (any pixel visible) rather than 0.1 (10% of the element's
    // area) — a tall multi-row grid can be thousands of pixels tall, so a
    // 10%-of-area threshold may never be satisfiable within a short
    // viewport and the section stays invisible forever. Fires as soon as
    // the top edge enters view instead, which is what "reveal on scroll"
    // actually means for content taller than the screen.
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setRevealed(true);
          if (once) io.disconnect();
        }
      }
    }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return {
    ref,
    className: `reveal${revealed ? " reveal-in" : ""}`,
    style: { transitionDelay: `${index * 60}ms` },
  };
}
