// /account — Auth/Profile/Username feature. Standalone route, protected:
// redirects unauthenticated visitors to /login. Reads state from useAuth()
// (lib/auth.js), the central auth store — no local Supabase polling here.
//
// Profile management follow-up (2026-08-26): username change, avatar
// upload/restore and GDPR account deletion replace the former "Coming
// soon" placeholders below.
import { useEffect, useCallback, useRef, useState } from "react";
import { Icon } from "../../components/shared/Icon.jsx";
import { DeleteAccountModal } from "../../components/auth/DeleteAccountModal.jsx";
import { ExportDataButton } from "../../components/auth/ExportDataButton.jsx";
import { useAuth } from "../../lib/auth.js";
import {
  updateUsername, uploadAvatar, restoreGoogleAvatar,
  validateUsername, isUsernameAvailable, normalizeAuthError,
} from "../../supabase.js";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return "—"; }
}

export default function AccountPage() {
  const { status, user, profile, signOut, refreshProfile } = useAuth();
  const [toast, setToast] = useState("");
  // Shared success feedback for the profile-management forms below (matches
  // the .toast pattern already used in PortfolioView.jsx) — a save/restore
  // that succeeds surfaces here instead of an inline "ok" line, so username
  // and avatar changes get the same visible confirmation as the rest of the app.
  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2800); }, []);

  useEffect(() => {
    if (status === "unauthenticated") window.location.replace("/login");
  }, [status]);

  // Private, authenticated-only page — never indexable (Task 5, SEO Foundation,
  // FASE 7). No canonical/OG here either: this route has nothing to offer a
  // crawler, and robots.txt alone can't stop a linked URL from appearing bare
  // in search results, so noindex meta is the correct mechanism.
  useEffect(() => {
    let el = document.querySelector('meta[name="robots"]');
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.setAttribute("content", "noindex");
  }, []);

  if (status !== "authenticated") {
    return (
      <div className="authpage">
        <div className="authpage-card"><p className="auth-p">Loading your account…</p></div>
      </div>
    );
  }

  const displayName = profile?.username || profile?.display_name || (user.email || "").split("@")[0];
  const initial = (displayName || "?").slice(0, 1).toUpperCase();
  const hasGoogle = (user.identities || []).some((i) => i.provider === "google");

  return (
    <div className="authpage">
      <div className="authpage-card" style={{ maxWidth: 460 }}>
        <a href="/" className="authpage-back">← DraGold</a>

        <div className="account-hero">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" className="account-avatar" style={{ objectFit: "cover" }} />
            : <div className="account-avatar">{initial}</div>}
          <div>
            <div className="account-name">{displayName}</div>
            <div className="account-email">{user.email}</div>
          </div>
        </div>

        <AvatarSection profile={profile} hasGoogle={hasGoogle} onUpdated={refreshProfile} onToast={flash} />

        <div className="account-section">
          <div className="account-section-h">Account</div>
          <div className="account-row">
            <span className="account-row-label">Email</span>
            <span className="account-row-value">{user.email}</span>
          </div>
          <div className="account-row">
            <span className="account-row-label">Member since</span>
            <span className="account-row-value">{fmtDate(profile?.created_at || user.created_at)}</span>
          </div>
        </div>

        <UsernameSection profile={profile} onUpdated={refreshProfile} onToast={flash} />

        <ExportDataButton />

        <DangerZone />

        <a href="/" className="btn btn-ghost btn-block" style={{ marginBottom: 10 }}>
          <Icon name="wallet" size={16} /> Go to Collection
        </a>
        <button className="btn btn-ghost btn-block" onClick={() => { signOut(); window.location.href = "/"; }}>
          <Icon name="logout" size={16} /> Sign out
        </button>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

function AvatarSection({ profile, hasGoogle, onUpdated, onToast }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = () => { if (!busy) fileRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setBusy(true); setErr("");
    const { error } = await uploadAvatar(file);
    setBusy(false);
    if (error) { setErr(normalizeAuthError(error)); return; }
    onUpdated?.();
    onToast?.("Profile picture updated.");
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const { error } = await restoreGoogleAvatar();
    setBusy(false);
    if (error) { setErr(normalizeAuthError(error)); return; }
    onUpdated?.();
    onToast?.("Restored your Google photo.");
  };

  return (
    <div className="account-section">
      <div className="account-section-h">Profile picture</div>
      {err && <div className="auth-err">{err}</div>}
      <div className="avatar-edit">
        <div className="avatar-edit-pic">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" />
            : <div className="account-avatar">{(profile?.username || "?").slice(0, 1).toUpperCase()}</div>}
          {busy && <div className="avatar-edit-spinner"><Icon name="camera" size={16} /></div>}
        </div>
        <div className="avatar-edit-actions">
          <div className="avatar-edit-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={pick} disabled={busy}>
              <Icon name="camera" size={14} /> Upload photo
            </button>
            {hasGoogle && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={restore} disabled={busy}>
                Use Google photo
              </button>
            )}
          </div>
          <span className="avatar-edit-hint">PNG, JPG or WebP — max 2MB.</span>
        </div>
        <input
          ref={fileRef} type="file" className="avatar-edit-input"
          accept="image/png,image/jpeg,image/webp" onChange={onFile}
        />
      </div>
    </div>
  );
}

function UsernameSection({ profile, onUpdated, onToast }) {
  const current = profile?.username || "";
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same'
  const [status, setStatus] = useState("idle");

  useEffect(() => { setValue(current); }, [current]);

  useEffect(() => {
    const v = value.trim();
    if (!v || v === current) { setStatus(v === current && v ? "same" : "idle"); return; }
    const vErr = validateUsername(v);
    if (vErr) { setStatus("invalid"); return; }
    setStatus("checking");
    const t = setTimeout(async () => {
      const available = await isUsernameAvailable(v);
      setStatus(available ? "available" : "taken");
    }, 400);
    return () => clearTimeout(t);
  }, [value, current]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || status === "invalid" || status === "taken" || status === "checking") return;
    const v = value.trim();
    if (!v || v === current) return;
    setBusy(true); setErr("");
    const { error } = await updateUsername(v);
    setBusy(false);
    if (error) { setErr(normalizeAuthError(error)); return; }
    onUpdated?.();
    onToast?.("Username updated.");
  };

  const canSubmit = !busy && value.trim() && value.trim() !== current && (status === "available" || status === "same");

  return (
    <div className="account-section">
      <div className="account-section-h">Username</div>
      {err && <div className="auth-err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field" style={{ marginBottom: 6 }}>
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. pikaking91"
            maxLength={20}
            disabled={busy}
          />
        </div>
        {status === "checking" && <div className="field-status pending">Checking availability…</div>}
        {status === "available" && <div className="field-status ok"><Icon name="check" size={13} /> Available</div>}
        {status === "taken" && <div className="field-status bad">This username is already taken.</div>}
        {status === "invalid" && <div className="field-status bad">3–20 characters: letters, numbers and underscore only.</div>}
        <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
          {busy ? "Saving…" : "Save username"}
        </button>
        <span className="avatar-edit-hint" style={{ display: "block", marginTop: 8 }}>
          You can change your username once every 24 hours.
        </span>
      </form>
    </div>
  );
}

function DangerZone() {
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <div className="danger-zone">
      <div className="account-section-h">Danger zone</div>
      <div className="danger-zone-desc">
        Deleting your account is permanent and removes your Collection, Watchlist, alerts and
        Academy progress. This cannot be undone.
      </div>
      <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setShowConfirm(true)}>
        <Icon name="trash" size={15} /> Delete account
      </button>
      {showConfirm && <DeleteAccountModal onClose={() => setShowConfirm(false)} />}
    </div>
  );
}
