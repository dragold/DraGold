import { useState } from "react";
import { createAlert } from "../../supabase.js";
import { toApiId } from "../../lib/cardId.js";
import { Sheet } from "./Sheet.jsx";

export function AlertModal({ card, cur, country, fmvUSD, eurRate, onClose, onDone }) {
  const [dir, setDir] = useState("above");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const t = parseFloat(threshold);
    if (isNaN(t) || t <= 0) { setErr("Enter a valid threshold."); return; }
    setBusy(true); setErr("");
    const targetEur = cur === "EUR" ? t : t * eurRate;
    const thresholdUSD = cur === "EUR" ? t / eurRate : t;
    const res = await createAlert({
      tcg: card.tcg, cardId: toApiId(card), cardName: card.name,
      language: card.lang || "en", threshold: thresholdUSD, targetEur, direction: dir,
      currency: "USD", country,
    });
    setBusy(false);
    if (res?.error) { setErr(typeof res.error === "string" ? res.error : res.error.message || "Could not create alert."); return; }
    onDone?.("Alert created");
  };

  const hintFmv = fmvUSD != null
    ? (cur === "EUR" ? `€${(fmvUSD * eurRate).toFixed(2)}` : `$${Number(fmvUSD).toFixed(2)}`)
    : null;

  return (
    <Sheet title="Create alert" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        <p className="auth-p">Get an email when the price crosses your threshold.{hintFmv && <> Current FMV: <b>{hintFmv}</b>.</>}</p>
        <label className="field-lbl">Trigger when price goes</label>
        <div className="seg">
          <button type="button" className={`seg-b ${dir === "above" ? "on" : ""}`} onClick={() => setDir("above")}>Above ↑</button>
          <button type="button" className={`seg-b ${dir === "below" ? "on" : ""}`} onClick={() => setDir("below")}>Below ↓</button>
        </div>
        <label className="field-lbl">Threshold ({cur === "EUR" ? "€" : "$"})</label>
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0"
          placeholder="0.00" value={threshold} onChange={e => setThreshold(e.target.value)} autoFocus />
        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating…" : "Create alert"}
        </button>
      </form>
    </Sheet>
  );
}
