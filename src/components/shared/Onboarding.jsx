import { useState } from "react";
import { Icon } from "./Icon.jsx";

/* ════════════════════════════════════════════════════════════════════════
   ONBOARDING — 3 step inline, dismissibile (primo accesso)
   ════════════════════════════════════════════════════════════════════════ */
// 2026-08 pivot realignment: the three steps now describe the actual product
// — discover the catalog, learn in the Academy, track a collection by
// completion — instead of the pre-pivot search-price / portfolio-P&L / price-
// alert loop. Storage key left as dg_ob_v1 on purpose: users who already
// dismissed onboarding are not re-interrupted; only new visitors see this.
export const ONBOARD_KEY = 'dg_ob_v1';
const ONBOARD_STEPS = [
  { icon:"search", label:"Discover", title:"Explore the catalog", desc:"Search any Pokémon, One Piece, Magic or Yu-Gi-Oh! card — or browse by set. Every card, set and artist has its own page." },
  { icon:"spark", label:"Learn", title:"Learn how it works", desc:"The Academy breaks down rarities, variants and how to read a card — short lessons, free, no sign-up." },
  { icon:"trophy", label:"Collect", title:"Track your collection", desc:"Mark the cards you own and watch each set fill up. It's about progress, not a price tag." },
];
export function Onboarding({ onDismiss }) {
  const [step, setStep] = useState(0);
  const s = ONBOARD_STEPS[step];
  return (
    <div className="onboard">
      <div className="onboard-pills">
        {ONBOARD_STEPS.map((st, i) => (
          <button key={i} className={`onboard-pill${step===i?' on':''}`} onClick={()=>setStep(i)}>
            <span className="onboard-n">{i+1}</span>
            <span>{st.label}</span>
          </button>
        ))}
      </div>
      <div className="onboard-body">
        <div className="onboard-ic"><Icon name={s.icon} size={22}/></div>
        <div className="onboard-title">{s.title}</div>
        <div className="onboard-desc">{s.desc}</div>
      </div>
      <div className="onboard-foot">
        {step < ONBOARD_STEPS.length - 1
          ? <button className="btn btn-ghost btn-sm" onClick={()=>setStep(p=>p+1)}>Next →</button>
          : <button className="btn btn-primary btn-sm" onClick={onDismiss}>Get started</button>
        }
        <button className="onboard-skip" onClick={onDismiss}>Skip</button>
      </div>
    </div>
  );
}
