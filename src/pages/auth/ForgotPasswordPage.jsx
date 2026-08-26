// /forgot-password — Auth/Profile/Username feature. Standalone route.
import { useState } from "react";
import { AuthLayout } from "../../components/auth/AuthLayout.jsx";
import { Icon } from "../../components/shared/Icon.jsx";
import { sendPasswordReset, normalizeAuthError, supabaseReady } from "../../supabase.js";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!supabaseReady) { setErr("Backend not configured."); return; }
    if (!email.trim()) { setErr("Enter your email."); return; }
    setBusy(true);
    const { error } = await sendPasswordReset(email.trim());
    setBusy(false);
    // Always show the "sent" state even on a lookup-style error, so we never
    // reveal whether an email is registered.
    if (error && !/rate limit|network/i.test(error.message || "")) { setSent(true); return; }
    if (error) { setErr(normalizeAuthError(error)); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout backHref="/login">
        <div className="auth-sent">
          <div className="auth-sent-ic"><Icon name="mail" size={28} /></div>
          <h3>Check your email</h3>
          <p>If an account exists for <b>{email}</b>, we sent a link to reset your password.</p>
          <a href="/login" className="btn btn-ghost btn-block">Back to sign in</a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout backHref="/login">
      <form onSubmit={submit} className="auth-form">
        <h3>Reset your password</h3>
        <p className="auth-p">Enter the email on your account and we'll send you a reset link.</p>

        {err && <div className="auth-err">{err}</div>}

        <div className="field">
          <label className="field-label" htmlFor="fp-email">Email</label>
          <input
            id="fp-email" type="email" inputMode="email" autoComplete="email" className="input"
            placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>

        <div className="authpage-foot">
          Remembered it? <a href="/login">Sign in</a>
        </div>
      </form>
    </AuthLayout>
  );
}
