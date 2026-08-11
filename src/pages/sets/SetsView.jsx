// DraGold — Explore/Sets (v1, P0-D).
// Riusa la fonte dati già esistente (loadSetsMap() / tabella set_logos, caricata una
// sola volta in DraGold.jsx e passata come prop): nessuna nuova query, nessuna nuova
// dipendenza. Scope v1 esplicitamente limitato: elenco set per TCG con logo/simbolo
// quando disponibile. Niente % di completamento (richiede join con collection, fuori
// scope), niente drill-down nel set (nessuna pagina di dettaglio set esiste ancora).
import { TCG_LIST } from "../../DraGold.jsx";

export function SetsView({ setsMap }) {
  const loading = setsMap == null;
  const allSets = loading ? [] : [...setsMap.values()];

  const byTcg = {};
  for (const s of allSets) {
    if (!byTcg[s.tcg]) byTcg[s.tcg] = [];
    byTcg[s.tcg].push(s);
  }
  for (const tcgId of Object.keys(byTcg)) {
    byTcg[tcgId].sort((a, b) => (a.set_name || "").localeCompare(b.set_name || ""));
  }

  // Ordine di visualizzazione coerente con la priorità di prodotto (CLAUDE.md §1):
  // Pokémon → One Piece → MTG/Yu-Gi-Oh.
  const orderedTcgs = TCG_LIST.filter(t => byTcg[t.id]?.length);

  return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Explore</h2></div>

      {loading ? (
        <div className="set-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skel-card">
              <div className="skel-img" style={{ aspectRatio: "5/3" }} />
              <div className="skel-line w70" />
            </div>
          ))}
        </div>
      ) : orderedTcgs.length === 0 ? (
        <div className="zero-state">
          <div className="zero-title">Sets not available yet</div>
          <div className="zero-sub">Try again in a moment.</div>
        </div>
      ) : (
        orderedTcgs.map(tcg => (
          <div key={tcg.id} className="set-section">
            <div className="sec-h">
              <span className="sec-h-t" style={{ color: tcg.color }}>{tcg.label}</span>
              <span className="sec-h-line" />
            </div>
            <div className="set-grid">
              {byTcg[tcg.id].map(s => (
                <div key={`${s.tcg}:${s.set_code}`} className="set-card">
                  <div className="set-card-logo">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt={s.set_name || s.set_code} loading="lazy"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : s.symbol_url ? (
                      <img src={s.symbol_url} alt={s.set_name || s.set_code} loading="lazy"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <span className="set-card-ph" style={{ color: tcg.color }}>{tcg.short}</span>
                    )}
                  </div>
                  <div className="set-card-name" title={s.set_name || s.set_code}>{s.set_name || s.set_code}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
