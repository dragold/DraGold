// Danger-zone confirmation for GDPR account deletion (Auth/Profile/Username
// feature — profile management follow-up). Reuses the existing Sheet shell
// (src/components/shared/Sheet.jsx), same pattern as PortfolioModal/AlertModal.
// Requires the user to type ELIMINA (Italian, per spec) before the destructive
// action becomes clickable — a plain "are you sure" confirm is too easy to
// click through by habit for something this irreversible.
import { useState } from "react";
import { Sheet } from "../shared/Sheet.jsx";
import { Icon } from "../shared/Icon.jsx";
import { deleteAccount, normalizeAuthError } from "../../supabase.js";

const CONFIRM_WORD = "ELIMINA";

export function DeleteAccountModal({ onClose }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_WORD;

  const confirm = async () => {
    if (!canConfirm || busy) return;
    setBusy(true); setErr("");
    const { error } = await deleteAccount();
    if (error) {
      setBusy(false);
      setErr(normalizeAuthError(error));
      return;
    }
    window.location.replace("/");
  };

  return (
    <Sheet title="Delete account" onClose={busy ? undefined : onClose}>
      <div className="confirm-delete-warning">
        <Icon name="alert" size={18} />
        <span>
          This permanently deletes your account, Collection, Watchlist, alerts and Academy
          progress. This cannot be undone.
        </span>
      </div>

      {err && <div className="auth-err">{err}</div>}

      <div className="field">
        <label className="field-label" htmlFor="delete-confirm-input">
          Type <span className="confirm-delete-word">{CONFIRM_WORD}</span> to confirm
        </label>
        <input
          id="delete-confirm-input"
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_WORD}
          autoComplete="off"
          autoCapitalize="characters"
          disabled={busy}
        />
      </div>

      <button
        type="button"
        className="btn btn-danger btn-block"
        disabled={!canConfirm || busy}
        onClick={confirm}
      >
        {busy ? "Deleting…" : "Permanently delete my account"}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 8 }}
        onClick={onClose}
        disabled={busy}
      >
        Cancel
      </button>
    </Sheet>
  );
}
