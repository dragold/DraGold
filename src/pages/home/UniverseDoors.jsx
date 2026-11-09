import { useReveal } from "../../lib/useReveal.js";
import { Icon } from "../../components/shared/Icon.jsx";
import "./universeDoors.css";

// ── THE UNIVERSE — four doors, one system ────────────────────────────────
// The transition from "an entire TCG universe in motion" toward the product.
// Not four SaaS feature cards: four nodes of a constellation, wired by thin
// --relation links, each carrying one real number. The link into a node lights
// gold on hover/focus.

function Door({ node, onActivate, index }) {
  const r = useReveal({ index });
  const Wrap = node.href ? "a" : "button";
  const props = node.href
    ? { href: node.href }
    : { type: "button", onClick: onActivate };
  return (
    <Wrap
      className={`uni-door ${r.className}`}
      style={{ ...r.style, gridArea: node.area }}
      ref={r.ref}
      {...props}
    >
      <span className="uni-door-ic" aria-hidden="true">
        <Icon name={node.icon} size={20} />
      </span>
      <span className="uni-door-name font-syne">{node.name}</span>
      <span className="uni-door-desc">{node.desc}</span>
      {node.metric != null && (
        <span className="uni-door-metric">
          <b>{node.metric}</b> {node.metricLabel}
        </span>
      )}
    </Wrap>
  );
}

export function UniverseDoors({
  setCount,
  cardCount,
  lessonCount,
  onExplore,
  onCollection,
  onMarket,
}) {
  const nodes = [
    {
      key: "explore",
      name: "Explore",
      icon: "grid",
      desc: "Every set, every era, laid out end to end.",
      metric: setCount != null ? `${setCount}+` : null,
      metricLabel: "sets",
      area: "a",
      onActivate: onExplore,
    },
    {
      key: "collection",
      name: "Collection",
      icon: "wallet",
      desc: "Track what you own and what each set is still missing.",
      area: "b",
      onActivate: onCollection,
    },
    {
      key: "market",
      name: "Market Intelligence",
      icon: "trend-up",
      desc: "Fair Market Value, sold comps and price history on any card.",
      metric: cardCount != null ? `${cardCount}` : null,
      metricLabel: "cards in the graph",
      area: "c",
      onActivate: onMarket,
    },
    {
      key: "academy",
      name: "Academy",
      icon: "doc",
      desc: "Short lessons on how TCG collecting actually works.",
      metric: lessonCount != null ? lessonCount : null,
      metricLabel: "lessons",
      href: "/academy",
      area: "d",
    },
  ];

  return (
    <section className="uni-doors" aria-labelledby="uni-doors-h">
      <p className="uni-doors-eyebrow">THE UNIVERSE</p>
      <h2 id="uni-doors-h" className="uni-doors-h font-syne">
        Four ways in. One graph underneath.
      </h2>

      <div className="uni-doors-grid">
        {/* the constellation wiring, purely decorative */}
        <svg className="uni-doors-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="26" y1="26" x2="74" y2="26" />
          <line x1="74" y1="26" x2="74" y2="74" />
          <line x1="74" y1="74" x2="26" y2="74" />
          <line x1="26" y1="74" x2="26" y2="26" />
          <line x1="26" y1="26" x2="74" y2="74" />
        </svg>
        {nodes.map((n, i) => (
          <Door key={n.key} node={n} onActivate={n.onActivate} index={i} />
        ))}
      </div>
    </section>
  );
}
