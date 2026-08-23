// /register — Auth/Profile/Username feature. Standalone route (main.jsx),
// same pattern as pages/tcg/TcgPage.jsx. Uses AuthProvider (lib/auth.js) only
// to redirect away if already signed in; the form itself talks to
// supabase.js auth helpers directly (no session to read yet during signup).
import { useState, useEffect } from "react";
import { AuthLayout, GoogleIcon } from "../../components/auth/AuthLayout.jsx";
import { Icon } from "../../components/shared/Icon.jsx";
import { useAuth } from "../../lib/auth.js";
import {
  signUpWithPassword, signInWithGoogle, resendVerificationEmail,
  validateUsername, validatePassword, isUsernameAvailable, normalizeAuthError,
  supabaseReady,
} from "../../supabase.js";

export default function RegisterPage() {
  const { status } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (status === "authenticated") window.location.replace("/account");
  }, [status]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr("");
    if (!supabaseReady) { setErr("Backend not configured."); return; }

    const uErr = validateUsername(username);
    if (uErr) { setErr(uErr); return; }
    const pErr = validatePassword(password);
    if (pErr) { setErr(pErr); return; }
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    if (!agree) { setErr("Please accept the Terms of Service and Privacy Policy."); return; }
    if (!email.trim()) { setErr("Email is required."); return; }

    setBusy(true);
    const available = await isUsernameAvailable(username.trim());
    if (!available) { setBusy(false); setErr("This username is already taken."); return; }

    const { data, error } = await signUpWithPassword({
      email: email.trim(), password, username: username.trim(),
    });
    setBusy(false);
    if (error) { setErr(normalizeAuthError(error)); return; }

    if (data?.session) {
      // Email confirmation disabled on this project — signed in immediately.
      window.location.replace("/account");
      return;
    }
    setSent(true);
  };

  const continueWithGoogle = async () => {
    if (googleBusy || !supabaseReady) return;
    setErr(""); setGoogleBusy(true);
    const { error } = await signInWithGoogle("/account");
    if (error) { setGoogleBusy(false); setErr(normalizeAuthError(error)); }
    // on success the browser redirects away — no further state to set here.
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="auth-sent">
          <div className="auth-sent-ic"><Icon name="mail" size={28} /></div>
          <h3>Check your email</h3>
          <p>We sent a confirmation link to <b>{email}</b>. Open it to activate your account, then sign in.</p>
          <button
            className="btn btn-ghost btn-block"
            style={{ marginBottom: 10 }}
            onClick={async () => { await resendVerificationEmail(email); }}
          >
            Resend verification email
          </button>
          <a href="/login" className="btn btn-primary btn-block">Go to sign in</a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={submit} className="auth-form">
        <h3>Create your account</h3>
        <p className="auth-p">Join DraGold — build your Collection, follow prices, learn with the Academy.</p>

        {err && <div className="auth-err">{err}</div>}

        <div className="field">
          <label className="field-label" htmlFor="reg-username">Username</label>
          <input
            id="reg-username" className="input" placeholder="e.g. pikaking91"
            value={username} onChange={e => setUsername(e.target.value)}
            autoComplete="username" required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email" type="email" inputMode="email" autoComplete="email" className="input"
            placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="reg-password">Password</label>
          <input
            id="reg-password" type="password" autoComplete="new-password" className="input"
            placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="reg-confirm">Confirm password</label>
          <input
            id="reg-confirm" type="password" autoComplete="new-password" className="input"
            placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} required
          />
        </div>

        <label className="checkbox-row">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          <span>I agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</span>
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <div className="authpage-sep">OR</div>

        <button type="button" className="btn btn-google btn-block" onClick={continueWithGoogle} disabled={googleBusy}>
          <GoogleIcon /> {googleBusy ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="authpage-foot">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </form>
    </AuthLayout>
  );
}
