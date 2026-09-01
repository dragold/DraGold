import { useEffect } from "react";

// Global smooth scroll (Atlas redesign). Mounts Lenis on the document, drives
// it from a single rAF loop, and — when GSAP/ScrollTrigger is present — keeps
// ScrollTrigger in sync so scroll-scrubbed timelines stay smooth. No-ops under
// prefers-reduced-motion and on coarse-pointer / small screens (native scroll
// is better there). Safe to mount once, high in the tree.
export function useLenis() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (reduce || coarse || window.innerWidth < 1024) return;

    let lenis;
    let rafId;
    let cancelled = false;

    (async () => {
      const { default: Lenis } = await import("lenis");
      if (cancelled) return;
      lenis = new Lenis({
        duration: 1.05,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
      });

      // Hand scroll updates to ScrollTrigger if it's loaded.
      try {
        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        if (!cancelled && ScrollTrigger) {
          lenis.on("scroll", ScrollTrigger.update);
        }
      } catch {
        /* gsap not present yet — fine */
      }

      const raf = (time) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    })();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
    };
  }, []);
}
