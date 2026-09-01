import "./shell.css";

// Stratum 7 — the atlas, briefly mapped. Replaces the old three-card
// "Coming soon" block with a restrained index: the worlds (real counts),
// the sections, one honest roadmap line, legal.
const WORLDS = [
  { key: "pokemon:en", label: "Pokémon", sub: "English", href: "/pokemon" },
  { key: "pokemon:ja", label: "Pokémon", sub: "Japanese", href: "/pokemon" },
  { key: "onepiece:en", label: "One Piece", sub: "English", href: "/onepiece" },
  { key: "onepiece:ja", label: "One Piece", sub: "Japanese", href: "/onepiece" },
];

export function SiteFooter({ worldCounts, onNavCollection }) {
  return (
    <footer className="site-footer">
      <div className="shell-wrap">
        <p className="site-footer-eyebrow">THE ATLAS</p>

        <div className="site-footer-worlds">
          {WORLDS.map((w) => {
            const n = worldCounts?.[w.key];
            return (
              <a key={w.key} className="site-footer-world" href={w.href}>
                <span className="site-footer-world-label">{w.label}</span>
                <span className="site-footer-world-sub">{w.sub}</span>
                <span className="site-footer-world-n">
                  {typeof n === "number" ? `${n.toLocaleString()} cards` : "—"}
                </span>
              </a>
            );
          })}
        </div>

        <nav className="site-footer-nav" aria-label="Sections">
          <a href="/academy">Academy</a>
          <a href="/card-id">Identify a card</a>
          <button type="button" onClick={onNavCollection}>Collection</button>
        </nav>

        <p className="site-footer-soon">Binder, Blog and Community are in progress.</p>

        <div className="site-footer-base">
          <span className="font-syne site-footer-mark">DraGold</span>
          <span className="site-footer-tag">The atlas for serious TCG collectors.</span>
          <div className="site-footer-legal">
            <a href="/privacy">Privacy</a>
            <span>·</span>
            <a href="/cookie-policy">Cookies</a>
            <span>·</span>
            <a href="mailto:hello@dragold.org">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
