// Shared visual shell for /login /register /forgot-password /reset-password
// (Auth/Profile/Username feature). Matches AuthModal's existing look
// (DraGold.jsx) but as a full standalone page, same pattern as
// pages/tcg/TcgPage.jsx etc. — main.jsx routes here directly.
export function AuthLayout({ children, backHref = "/" }) {
  return (
    <div className="authpage">
      <div className="authpage-card">
        <a href={backHref} className="authpage-back">← DraGold</a>
        <div className="modal-logo">
          <img src="/logo192.png" alt="DraGold" style={{ width: 56, height: 56, borderRadius: 14, display: "block", margin: "0 auto 10px" }} />
          <span className="font-syne">DraGold</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
