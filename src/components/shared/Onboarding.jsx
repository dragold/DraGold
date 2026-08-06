import { useState } from "react";
import { Icon } from "./Icon.jsx";

/* ════════════════════════════════════════════════════════════════════════
   ONBOARDING — 3 step inline, dismissibile (primo accesso)
   ════════════════════════════════════════════════════════════════════════ */
export const ONBOARD_KEY = 'dg_ob_v1';
const ONBOARD_STEPS = [
  { icon:"search", label:"Search", title:"Search a card", desc:"Find any Pokémon, One Piece, Magic or Yu-Gi-Oh! card and see its real market price." },
  { icon:"wallet", label:"Portfolio", title:"Add to Portfolio", desc:"Log cards you own and track their value vs what you paid — your TCG P&L." },
  { icon:"bell", label:"Alert", title:"Set a price alert", desc:"Get an email when any card crosses your threshold. Never miss a move." },
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
