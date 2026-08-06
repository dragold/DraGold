import { useState } from "react";
import { addToCollection } from "../../supabase.js";
import { toApiId } from "../../lib/cardId.js";
import { CONDITIONS } from "../../DraGold.jsx";
import { Sheet } from "./Sheet.jsx";

export function PortfolioModal({ card, cur, onClose, onDone }) {
  const [paid, setPaid] = useState("");
  const [cond, setCond] = useState("NM");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    const paidNum = parseFloat(paid);
    const res = await addToCollection({
      card_api_id: toApiId(card),
      tcg: card.tcg,
      card_name: card.name,
      set_name: card.set_name || "",
      card_number: card.card_number || null,
      image_url: card.image_url || null,
      language: card.lang || "en",
      condition: cond,
      purchase_price: isNaN(paidNum) ? null : paidNum,
      fmv_currency: cur,
    });
    setBusy(false);
    if (res?.error) { setErr(typeof res.error === "string" ? res.error : res.error.message || "Could not add."); return; }
    onDone?.("Added to portfolio");
  };

  return (
    <Sheet title="Add to portfolio" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        <label className="field-lbl">Price paid ({cur})</label>
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0"
          placeholder="0.00" value={paid} onChange={e => setPaid(e.target.value)} autoFocus />
        <label className="field-lbl">Condition</label>
        <div className="cond-row">
          {CONDITIONS.map(c => (
            <button type="button" key={c}
              className={`cond-b ${cond === c ? "on" : ""}`}
              onClick={() => setCond(c)}>{c}</button>
          ))}
        </div>
        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Adding…" : "Add to portfolio"}
        </button>
      </form>
    </Sheet>
  );
}
