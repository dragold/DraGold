// DraGold — Explore/Sets (v1, P0-D).
// Riusa la fonte dati già esistente (loadSetsMap() / tabella set_logos, caricata una
// sola volta in DraGold.jsx e passata come prop): nessuna nuova query, nessuna nuova
// dipendenza. Scope v1 esplicitamente limitato: elenco set per TCG con logo/simbolo
// quando disponibile. Niente % di completamento (richiede join con collection, fuori
// scope).
//
// Click su una tile → SetDetailPage (onOpenSet, wiring STEP 2). Lingua di default 'en':
// verificato su Supabase il 12/08/2026 che risolve il set corretto per Pokémon e One
// Piece (vedi commento in SetDetailPage.jsx).
//
// Fallback loghi One Piece (STEP 3, verificato il 12/08/2026): i loghi ufficiali
// (en.onepiece-cardgame.com) sono protetti da hotlink — l'immagine "carica" (evento
// load, complete:true) ma restituisce 0×0 px, quindi il solo onError non basta a
// rilevare il fallimento e la tile resta con uno spazio vuoto. Nessuna fonte
// alternativa con licenza chiara e hosting stabile è stata trovata in tempi
// ragionevoli (apitcg/one-piece-tcg-data su GitHub non ha una licenza dichiarata ed
// è un progetto piccolo/non garantito; optcgapi.com ripropone gli stessi asset
// ufficiali con lo stesso blocco hotlink). Soluzione: fallback elegante invece di un
// rettangolo bianco — tile brandizzata con codice set ben leggibile.
//
// Design-system pass (2026-08): questa pagina era rimasta con lo stile "P0"
// originale (hover a scala, header generico) mentre il resto del prodotto è
// passato al linguaggio North Star (lift+press sulle tile, header editoriale,
// reveal-on-scroll). Nessun dato/logica toccato, solo presentazione.
import { useState } from "react";
import { TCG_LIST } from "../../DraGold.jsx";
import { useReveal } from "../../lib/useReveal.js";

function SetTile({ s, tcg, onOpenSet }) {
  const [imgOk, setImgOk] = useState(true);
  const src = s.logo_url || s.symbol_url;
  const showImg = !!src && imgOk;

  const open = () => onOpenSet?.({ tcg: s.tcg, set_id: s.set_code, lang: "en", set_name: s.set_name });

  return (
    <div className="set-card"
      role={onOpenSet ? "button" : undefined} tabIndex={onOpenSet ? 0 : undefined}
      onClick={open}
      onKeyDown={e => { if (onOpenSet && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}>
      <div className="set-card-logo">
        {showImg ? (
          <img src={src} alt={s.set_name || s.set_code} loading="lazy"
            onError={() => setImgOk(false)}
            onLoad={e => { if (e.currentTarget.naturalWidth === 0) setImgOk(false); }} />
        ) : (
          <div className="set-card-fallback" style={{ color: tcg.color, borderColor: `${tcg.color}33` }}>
            <span className="set-card-fallback-code">{s.set_code}</span>
            <span className="set-card-fallback-tcg">{tcg.short}</span>
          </div>
        )}
      </div>
      <div className="set-card-name" title={s.set_name || s.set_code}>{s.set_name || s.set_code}</div>
    </div>
  );
}

function TcgSection({ tcg, sets, onOpenSet, index }) {
  const reveal = useReveal(index);
  return (
    <div ref={reveal.ref} className={reveal.className} style={reveal.style}>
      <div className="set-section">
        <div className="sec-h">
          <span className="sec-h-t" style={{ color: tcg.color }}>{tcg.label}</span>
          <span className="sec-h-line" />
          <span className="explore-count">{sets.length}</span>
        </div>
        <div className="set-grid">
          {sets.map(s => (
            <SetTile key={`${s.tcg}:${s.set_code}`} s={s} tcg={tcg} onOpenSet={onOpenSet} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SetsView({ setsMap, onOpenSet }) {
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
  const totalSets = orderedTcgs.reduce((n, t) => n + byTcg[t.id].length, 0);

  return (
    <section className="view">
      <div className="explore-head">
        <span className="explore-eyebrow">The catalog, by set</span>
        <h1 className="explore-title">Explore</h1>
        {!loading && totalSets > 0 && (
          <p className="explore-sub">{totalSets} sets across {orderedTcgs.length} game{orderedTcgs.length !== 1 ? "s" : ""}.</p>
        )}
      </div>

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
        orderedTcgs.map((tcg, i) => (
          <TcgSection key={tcg.id} tcg={tcg} sets={byTcg[tcg.id]} onOpenSet={onOpenSet} index={i} />
        ))
      )}
    </section>
  );
}
