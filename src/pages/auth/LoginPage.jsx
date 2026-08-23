// /login — Auth/Profile/Username feature. Standalone route (main.jsx).
import { useState, useEffect } from "react";
import { AuthLayout, GoogleIcon } from "../../components/auth/AuthLayout.jsx";
import { useAuth } from "../../lib/auth.js";
import {
  signInWithPassword, signInWithGoogle, resendVerificationEmail,
  normalizeAuthError, supabaseReady,
} from "../../supabase.js";

export default function LoginPage() {
  const { status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") window.location.replace("/");
  }, [status]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(""); setUnverified(false);
    if (!supabaseReady) { setErr("Backend not configured."); return; }
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }

    setBusy(true);
    const { data, error } = await signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("email not confirmed")) setUnverified(true);
      setErr(normalizeAuthError(error));
      return;
    }
    if (data?.session) window.location.replace("/");
  };

  const continueWithGoogle = async () => {
    if (googleBusy || !supabaseReady) return;
    setErr(""); setGoogleBusy(true);
    const { error } = await signInWithGoogle("/");
    if (error) { setGoogleBusy(false); setErr(normalizeAuthError(error)); }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="auth-form">
        <h3>Sign in</h3>
        <p className="auth-p">Welcome back to DraGold.</p>

        {err && <div className="auth-err">{err}</div>}
        {unverified && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginBottom: 12 }}
            onClick={async () => { await resendVerificationEmail(email.trim()); setResent(true); }}
          >
            {resent ? "Verification email sent" : "Resend verification email"}
          </button>
        )}

        <div className="field">
          <label className="field-label" htmlFor="login-email">Email</label>
          <input
            id="login-email" type="email" inputMode="email" autoComplete="email" className="input"
            placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="login-password">Password</label>
          <input
            id="login-password" type="password" autoComplete="current-password" className="input"
            placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>

        <div className="authpage-links-row">
          <span />
          <a href="/forgot-password" className="authpage-link">Forgot password?</a>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="authpage-sep">OR</div>

        <button type="button" className="btn btn-google btn-block" onClick={continueWithGoogle} disabled={googleBusy}>
          <GoogleIcon /> {googleBusy ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="authpage-foot">
          Don't have an account? <a href="/register">Create one</a>
        </div>
      </form>
    </AuthLayout>
  );
}
