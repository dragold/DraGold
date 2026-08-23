// Shared placeholder body for /terms and /privacy — Auth/Profile/Username
// feature requires these to be real, navigable, non-dead links from the
// registration checkbox. Real legal text is a separate task (needs legal
// review) — this page says so explicitly rather than inventing terms.
export function LegalPage({ title, updated = "23 August 2026" }) {
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
          <div className="legal-note">
            Placeholder page — the full {title.toLowerCase()} text is pending legal review and has not
            been written yet. This page exists only so the registration flow does not link to a
            dead page. Do not treat anything below as a binding agreement.
          </div>
          <p style={{ color: "var(--dim)", fontSize: 13 }}>Last updated: {updated}</p>
          <h2>What this will cover</h2>
          <p>
            {title} will describe how DraGold — a TCG knowledge graph, learning Academy and
            personal card Collection tool — handles your account, the data you provide, and the
            rules for using the service.
          </p>
          <h2>Contact</h2>
          <p>Questions in the meantime: <a href="mailto:hello@dragold.org" className="authpage-link">hello@dragold.org</a>.</p>
        </div>
      </main>
    </div>
  );
}
