import { useEffect, useRef } from "react";

// The Card → Knowledge descent as one scroll-scrubbed timeline. The specimen
// is CSS-sticky (no GSAP pinning) inside `.atlas-stage`; this hook only drives
// its transforms from the stage's scroll progress. No-ops under
// prefers-reduced-motion and below the desktop breakpoint — there the page is
// the designed static document.
//
// stageRef: the tall scroll container (threshold + all strata).
// specimenRef: the CardSpecimen imperative handle ({ plate, art, frame, holo, back }).
export function useAtlasChoreography(stageRef, specimenRef) {
  const tlRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || window.innerWidth < 1024) return;

    const stage = stageRef.current;
    const parts = specimenRef.current;
    if (!stage || !parts?.plate) return;

    let ctx;
    let cancelled = false;

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const { plate, art, frame, holo, back } = parts;

        gsap.set([plate, art, frame, holo, back], { transformStyle: "preserve-3d" });
        gsap.set(plate, { transformOrigin: "50% 50%" });
        gsap.set(art, { z: 1 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "bottom bottom",
            scrub: 1,
          },
          defaults: { ease: "none" },
        });
        tlRef.current = tl;

        // 0 → 1 · Threshold → Identity: the card turns to present itself
        tl.to(plate, { rotateY: 18, rotateX: -11, duration: 1 }, 0)
          .to(holo, { opacity: 0.9, duration: 1 }, 0);

        // 1 → 2 · Identity → Set: the card delaminates — art lifts clear of the
        // frame and the back plane drops away, you see it come apart in space
        tl.to(art, { z: 120, y: -14, duration: 1 }, 1)
          .to(frame, { z: 10, scale: 1.06, opacity: 1, duration: 1 }, 1)
          .to(back, { z: -90, y: 22, opacity: 0.7, rotate: -3, duration: 1 }, 1)
          .to(plate, { rotateY: 26, rotateX: -4, duration: 1 }, 1);

        // 2 → 3 · Set → Print: the plate sweeps the other way — foil rakes
        // across like a real print catching light as it turns
        tl.to(plate, { rotateY: -38, rotateX: 3, duration: 1 }, 2)
          .to(holo, { "--foil-angle": "50deg", opacity: 1, duration: 1 }, 2)
          .to(art, { z: 60, y: 0, duration: 1 }, 2)
          .to(frame, { z: 4, scale: 1.02, duration: 1 }, 2)
          .to(back, { z: -50, y: 8, duration: 1 }, 2);

        // 3 → 4 · Print → History: the card recedes to a point in time
        tl.to(plate, { rotateY: -4, rotateX: -2, scale: 0.55, y: -40, duration: 1 }, 3)
          .to([art, frame, back], { z: 0, y: 0, scale: 1, duration: 1 }, 3)
          .to(holo, { opacity: 0.35, duration: 1 }, 3);

        // 4 → 5 · History → Knowledge: it re-forms, opens toward you, softens
        tl.to(plate, { rotateY: 10, rotateX: -6, scale: 0.82, y: 0, duration: 1 }, 4)
          .to(art, { z: 30, duration: 1 }, 4)
          .to(frame, { opacity: 0.45, z: -6, duration: 1 }, 4)
          .to(holo, { opacity: 0.5, duration: 1 }, 4);

        // 5 → 6 · Knowledge → Collection: whole and lit — now it's yours
        tl.to(plate, { rotateY: 0, rotateX: 0, scale: 1, duration: 1 }, 5)
          .to([art, frame], { z: 0, opacity: 1, scale: 1, duration: 1 }, 5)
          .to(back, { z: -14, y: 0, rotate: 0, opacity: 0.5, duration: 1 }, 5)
          .to(holo, { opacity: 0.75, "--foil-angle": "115deg", duration: 1 }, 5);
      }, stage);

      ScrollTrigger.refresh();
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
      tlRef.current = null;
    };
  }, [stageRef, specimenRef]);
}
