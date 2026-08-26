// "Scarica i miei dati" — GDPR Art. 20 export button. New standalone
// component (Auth/Profile/Privacy feature) so it can be dropped into
// AccountPage.jsx as a single import + one JSX line, minimizing overlap
// with the profile-management work in progress on that file.
import { useState } from "react";
import { Icon } from "../shared/Icon.jsx";
import { exportUserData } from "../../lib/gdprExport.js";

export function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true); setErr(""); setOk(false);
    const { error } = await exportUserData();
    setBusy(false);
    if (error) { setErr(error.message || "Something went wrong."); return; }
    setOk(true);
  };

  return (
    <div className="account-section">
      <div className="account-section-h">Your data</div>
      <div className="danger-zone-desc" style={{ marginBottom: 12 }}>
        Download a copy of everything DraGold holds about your account — profile, Collection,
        Watchlist, alerts and Academy progress — as a single JSON file (GDPR Art. 20).
      </div>
      {err && <div className="auth-err">{err}</div>}
      <button type="button" className="btn btn-ghost btn-block" onClick={run} disabled={busy}>
        <Icon name="doc" size={15} /> {busy ? "Preparing your file…" : "Download my data"}
      </button>
      {ok && <div className="field-status ok" style={{ marginTop: 8 }}><Icon name="check" size={13} /> Download started.</div>}
    </div>
  );
}
