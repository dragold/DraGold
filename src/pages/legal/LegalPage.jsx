// Shared shell for /terms, /privacy and /cookie-policy. Renders `children`
// (real legal body content) when provided; falls back to the original
// "pending legal review" placeholder note when it isn't, so /terms (out of
// scope for the Privacy & Compliance GDPR task) keeps behaving exactly as
// before without needing its own copy of this markup.
export function LegalPage({ title, updated = "26 August 2026", children }) {
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-in">
          <a href="/" className="brand">
            <img src="/logo192.png" alt="DraGold" style={{ height: 30, width: 30, borderRadius: 7, flexShrink: 0 }} />
            <span className="logo-txt font-syne">DraGold</span>
          </a>
        </div>
      </header>
      <main className="main">
        <div className="legal-page">
          <a href="/" className="authpage-back">← Back to DraGold</a>
          <h1>{title}</h1>
          <p style={{ color: "var(--dim)", fontSize: 13 }}>Last updated: {updated}</p>

          {children ? children : (
            <>
              <div className="legal-note">
                Placeholder page — the full {title.toLowerCase()} text is pending legal review and has not
                been written yet. This page exists only so the registration flow does not link to a
                dead page. Do not treat anything below as a binding agreement.
              </div>
              <h2>What this will cover</h2>
              <p>
                {title} will describe how DraGold — a TCG knowledge graph, learning Academy and
                personal card Collection tool — handles your account, the data you provide, and the
                rules for using the service.
              </p>
              <h2>Contact</h2>
              <p>Questions in the meantime: <a href="mailto:hello@dragold.org" className="authpage-link">hello@dragold.org</a>.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
