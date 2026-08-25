// /account — Auth/Profile/Username feature. Standalone route, protected:
// redirects unauthenticated visitors to /login. Reads state from useAuth()
// (lib/auth.js), the central auth store — no local Supabase polling here.
import { useEffect } from "react";
import { Icon } from "../../components/shared/Icon.jsx";
import { useAuth } from "../../lib/auth.js";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return "—"; }
}

export default function AccountPage() {
  const { status, user, profile, signOut } = useAuth();

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

  return (
    <div className="authpage">
      <div className="authpage-card" style={{ maxWidth: 460 }}>
        <a href="/" className="authpage-back">← DraGold</a>

        <div className="account-hero">
          <div className="account-avatar">{initial}</div>
          <div>
            <div className="account-name">{displayName}</div>
            <div className="account-email">{user.email}</div>
          </div>
        </div>

        <div className="account-section">
          <div className="account-section-h">Account</div>
          <div className="account-row">
            <span className="account-row-label">Username</span>
            <span className="account-row-value">{profile?.username || "— not set —"}</span>
          </div>
          <div className="account-row">
            <span className="account-row-label">Email</span>
            <span className="account-row-value">{user.email}</span>
          </div>
          <div className="account-row">
            <span className="account-row-label">Member since</span>
            <span className="account-row-value">{fmtDate(profile?.created_at || user.created_at)}</span>
          </div>
        </div>

        <div className="account-section">
          <div className="account-section-h">Coming soon</div>
          <div className="account-row">
            <span className="account-row-label">Change username</span>
            <span className="badge-todo">Soon</span>
          </div>
          <div className="account-row">
            <span className="account-row-label">Profile picture</span>
            <span className="badge-todo">Soon</span>
          </div>
          <div className="account-row">
            <span className="account-row-label">Delete account</span>
            <span className="badge-todo">Soon</span>
          </div>
        </div>

        <a href="/" className="btn btn-ghost btn-block" style={{ marginBottom: 10 }}>
          <Icon name="wallet" size={16} /> Go to Collection
        </a>
        <button className="btn btn-ghost btn-block" onClick={() => { signOut(); window.location.href = "/"; }}>
          <Icon name="logout" size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}
