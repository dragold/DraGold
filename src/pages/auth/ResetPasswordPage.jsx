// /reset-password — Auth/Profile/Username feature. Standalone route.
// Reached via the email link from ForgotPasswordPage. Supabase's client
// (detectSessionInUrl: true, src/supabase.js) parses the recovery token from
// the URL on load and fires a PASSWORD_RECOVERY auth event with a temporary
// session — we wait for that (or an already-present session) before letting
// the user set a new password.
import { useState, useEffect } from "react";
import { AuthLayout } from "../../components/auth/AuthLayout.jsx";
import { supabase, updatePassword, validatePassword, normalizeAuthError, signOut } from "../../supabase.js";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setErr("Backend not configured."); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive && data.session) setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady(true);
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    const pErr = validatePassword(password);
    if (pErr) { setErr(pErr); return; }
    if (password !== confirm) { setErr("Passwords do not match."); return; }

    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) { setErr(normalizeAuthError(error)); return; }
    await signOut();
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout backHref="/login">
        <div className="auth-sent">
          <div className="auth-sent-ic">✓</div>
          <h3>Password updated</h3>
          <p>Your password has been changed. Sign in with your new password.</p>
          <a href="/login" className="btn btn-primary btn-block">Go to sign in</a>
        </div>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout backHref="/login">
        <div className="auth-form">
          <h3>Reset your password</h3>
          {err ? <div className="auth-err">{err}</div> : (
            <p className="auth-p">Verifying your reset link…</p>
          )}
          <div className="authpage-foot">
            Link not working? <a href="/forgot-password">Request a new one</a>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backHref="/login">
      <form onSubmit={submit} className="auth-form">
        <h3>Choose a new password</h3>
        <p className="auth-p">Set a new password for your DraGold account.</p>

        {err && <div className="auth-err">{err}</div>}

        <div className="field">
          <label className="field-label" htmlFor="rp-password">New password</label>
          <input
            id="rp-password" type="password" autoComplete="new-password" className="input"
            placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="rp-confirm">Confirm new password</label>
          <input
            id="rp-confirm" type="password" autoComplete="new-password" className="input"
            placeholder="Repeat your new password" value={confirm} onChange={e => setConfirm(e.target.value)} required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}
