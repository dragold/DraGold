import { useEffect, useMemo, useRef, useState } from "react";
import { generateStarfield, VIEWBOX } from "./starfield.js";
import "./nightSky.css";

// ── DraGold night sky ────────────────────────────────────────────────────
// The global atmospheric layer that sits behind every route (mounted once in
// main.jsx, outside the router). Fixed, full-viewport, pointer-events:none,
// aria-hidden — it never touches layout, focus order or the accessibility
// tree. Three layers, cheapest first:
//   1. deep-navy gradient + two faint accent glows       (pure CSS, always on)
//   2. a few dozen discreet stars + two constellations   (inline SVG, always on)
//   3. a whisper of pointer parallax                     (desktop + fine pointer
//                                                          + motion allowed only)
// No canvas, no WebGL, no requestAnimationFrame loop — twinkle is CSS, parallax
// is event-driven and idles itself. If motion is reduced everything is static.

const PARALLAX_MAX = 14; // px of travel at the viewport edge

function media(q) {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(q)
    : { matches: false, addEventListener() {}, removeEventListener() {} };
}

export default function NightSky() {
  const rootRef = useRef(null);
  const fieldRef = useRef(null);
  const frame = useRef(0);

  // Coarse pointers (phones/tablets) get a lighter field and never the
  // parallax. Decided once on mount; a resize across the breakpoint is rare
  // enough that re-generating on it isn't worth the complexity.
  const [coarse] = useState(() => media("(pointer: coarse)").matches);

  const field = useMemo(
    () => generateStarfield(coarse ? { stars: 40 } : undefined),
    [coarse],
  );

  useEffect(() => {
    const motionOK = !media("(prefers-reduced-motion: reduce)").matches;
    const fine = media("(hover: hover) and (pointer: fine)").matches;
    if (!motionOK || !fine) return;

    const el = fieldRef.current;
    if (!el) return;

    let px = 0;
    let py = 0;
    const apply = () => {
      frame.current = 0;
      el.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`;
    };
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      px = -nx * PARALLAX_MAX;
      py = -ny * PARALLAX_MAX;
      if (!frame.current) frame.current = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      px = 0;
      py = 0;
      if (!frame.current) frame.current = requestAnimationFrame(apply);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.removeEventListener("pointermove", onMove);
      } else {
        window.addEventListener("pointermove", onMove, { passive: true });
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mouseout", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div ref={rootRef} className="dg-sky" aria-hidden="true">
      <div className="dg-sky__glow" />
      <svg
        ref={fieldRef}
        className="dg-sky__field"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        {field.constellations.map((c, ci) => (
          <g key={ci} className="dg-sky__constellation">
            {c.links.map(([a, b], li) => (
              <line
                key={li}
                x1={c.nodes[a].x}
                y1={c.nodes[a].y}
                x2={c.nodes[b].x}
                y2={c.nodes[b].y}
              />
            ))}
            {c.nodes.map((n, ni) => (
              <circle
                key={ni}
                cx={n.x}
                cy={n.y}
                r={n.r}
                className={n.gold ? "is-gold" : undefined}
              />
            ))}
          </g>
        ))}
        <g className="dg-sky__stars">
          {field.stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              className={s.gold ? "is-gold" : undefined}
              style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
