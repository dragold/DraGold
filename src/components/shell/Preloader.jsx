import { useEffect, useState } from "react";
import "./shell.css";

const STEPS = ["D", "DR", "DRA", "DRAG", "DRAGO", "DRAGOL", "DRAGOLD"];
const SEEN_KEY = "dg_preloader_seen";
const DURATION = 1000; // build phase; total on screen ≤ ~1.4s incl. fade

function seen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — just don't persist */
  }
}

export function Preloader() {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const skipInitial = reduce || seen();

  const [gone, setGone] = useState(skipInitial);
  const [step, setStep] = useState(skipInitial ? STEPS.length - 1 : 0);

  useEffect(() => {
    if (gone) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      setStep(Math.min(STEPS.length - 1, Math.floor(t * STEPS.length)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame(tick);
    const hardStop = setTimeout(finish, 1200);
    function finish() {
      markSeen();
      setGone(true);
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hardStop);
    };
  }, [gone]);

  useEffect(() => {
    if (gone) return;
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        markSeen();
        setGone(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gone]);

  if (gone) return null;

  return (
    <div className="preloader" role="status" aria-busy="true" aria-label="Loading DraGold">
      <span className="preloader-word font-syne">{STEPS[step]}</span>
      <button
        className="preloader-skip"
        onClick={() => {
          markSeen();
          setGone(true);
        }}
      >
        Skip
      </button>
    </div>
  );
}
