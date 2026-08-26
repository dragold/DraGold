// DraGold - "Coming soon" strip (extracted from DraGold.jsx, Home visual pass).
// Was a `.up-grid{grid-template-columns:1fr}` single column that stacked 3
// large disabled cards full-width one under another -- the layout Ermal
// flagged as wasting space and not reading as a real roadmap teaser. Same
// content (no invented items), compact multi-column CSS (.up-grid now
// `repeat(auto-fit,minmax(150px,1fr))`, see styles.css), moved into its own
// component per CLAUDE.md 5 (new features shouldn't live directly inside
// DraGold.jsx -- it should evolve into an orchestrator, not stay a monolith).
import { Icon } from "./Icon.jsx";

export const UPCOMING = [
  { id: "binder", label: "Binder", icon: "grid", desc: "Browse your collection in virtual binders." },
  { id: "blog", label: "Blog", icon: "doc", desc: "Guides, market analysis, news." },
  { id: "community", label: "Community", icon: "users", desc: "Share and compare your cards." },
];

export function ComingSoon() {
  return (
    <section className="upcoming">
      <div className="sec-h">
        <span className="sec-h-t">Coming soon</span>
        <span className="sec-h-line" />
      </div>
      <div className="up-grid">
        {UPCOMING.map(u => (
          <div key={u.id} className="up-card" aria-disabled="true">
            <div className="up-top">
              <span className="up-ic"><Icon name={u.icon} size={16} /></span>
              <span className="badge-soon">Soon</span>
            </div>
            <div className="up-label">{u.label}</div>
            <div className="up-desc">{u.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
