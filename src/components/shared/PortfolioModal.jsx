import { useState, useMemo } from "react";
import { addToCollection } from "../../supabase.js";
import { toApiId } from "../../lib/cardId.js";
import { CONDITIONS } from "../../DraGold.jsx";
import { Sheet } from "./Sheet.jsx";
import { GRADING_COMPANIES, gradeOptions } from "../../lib/grading.js";

export function PortfolioModal({ card, cur, onClose, onDone }) {
  const [isGraded, setIsGraded] = useState(false);
  const [paid, setPaid] = useState("");
  const [cond, setCond] = useState("NM");
  const [company, setCompany] = useState("PSA");
  const [grade, setGrade] = useState("10");
  const [cert, setCert] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const currentGradeOpts = useMemo(() => gradeOptions(company), [company]);

  const onCompanyChange = (c) => {
    setCompany(c);
    const opts = gradeOptions(c);
    if (opts.length > 0) setGrade(opts[0].value);
  };

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
      condition: isGraded ? null : cond,
      is_graded: isGraded,
      grade_company: isGraded ? company : null,
      grade_value: isGraded ? grade : null,
      notes: isGraded && cert ? `Cert #${cert.trim()}` : null,
      purchase_price: isNaN(paidNum) ? null : paidNum,
      fmv_currency: cur,
    });
    setBusy(false);
    if (res?.error) { setErr(typeof res.error === "string" ? res.error : res.error.message || "Could not add."); return; }
    onDone?.(isGraded ? `Added ${company} ${grade} to portfolio` : "Added to portfolio");
  };

  return (
    <Sheet title="Add to portfolio" onClose={onClose}>
      <form onSubmit={submit} className="sheet-form">
        <label className="field-lbl">Card type</label>
        <div className="cond-row" style={{ marginBottom: 14 }}>
          <button type="button"
            className={`cond-b ${!isGraded ? "on" : ""}`}
            onClick={() => setIsGraded(false)}>Raw Card</button>
          <button type="button"
            className={`cond-b ${isGraded ? "on" : ""}`}
            onClick={() => setIsGraded(true)}>Graded Slab</button>
        </div>

        <label className="field-lbl">Price paid ({cur})</label>
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0"
          placeholder="0.00" value={paid} onChange={e => setPaid(e.target.value)} autoFocus />

        {!isGraded ? (
          <>
            <label className="field-lbl">Condition</label>
            <div className="cond-row">
              {CONDITIONS.map(c => (
                <button type="button" key={c}
                  className={`cond-b ${cond === c ? "on" : ""}`}
                  onClick={() => setCond(c)}>{c}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="field-lbl">Grading company</label>
            <div className="cond-row" style={{ gap: 6, marginBottom: 10 }}>
              {GRADING_COMPANIES.map(g => (
                <button type="button" key={g.id}
                  className={`cond-b ${company === g.id ? "on" : ""}`}
                  style={{ minWidth: 42, padding: "8px 4px", fontSize: 12 }}
                  onClick={() => onCompanyChange(g.id)}>{g.id}</button>
              ))}
            </div>

            <label className="field-lbl">Grade</label>
            <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
              {currentGradeOpts.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <label className="field-lbl">Certification # (optional)</label>
            <input className="input" type="text" placeholder="e.g. 12345678"
              value={cert} onChange={e => setCert(e.target.value)} />
          </>
        )}

        {err && <div className="auth-err">{err}</div>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Adding…" : isGraded ? `Add ${company} Slab` : "Add to portfolio"}
        </button>
      </form>
    </Sheet>
  );
}
