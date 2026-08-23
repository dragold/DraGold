// DraGold — Explore/Sets (Explorer/Set-Experience feature, builds on v1 P0-D).
//
// Pokémon + One Piece: still sourced from setsMap (set_logos, cached once via
// lib/state.js loadSetsMap() — zero new queries for the default tab load,
// same as before) — now also carrying release_date (added to that query by
// this task), so sets sort release_date DESC and group by year for real,
// instead of the previous alphabetical order.
//
// MTG + Yu-Gi-Oh!: set_logos has no rows for these two TCGs (verified on
// Supabase), so they were entirely absent from Explore before. They're now
// real sections, loaded lazily on demand via lib/tcgSets.js's loadTcgSets()
// (same computation the public /mtg //ygo hub pages use, memoized) — not
// fetched eagerly on tab-open, to keep the default Explore load as cheap as
// it was (canonical_cards has 27k/14k rows for mtg/ygo respectively; scanning
// both up front on every Explore visit would be a real regression).
//
// Fallback loghi One Piece (STEP 3, verificato il 12/08/2026): i loghi ufficiali
// (en.onepiece-cardgame.com) sono protetti da hotlink — l'immagine "carica" (evento
// load, complete:true) ma restituisce 0×0 px, quindi il solo onError non basta a
// rilevare il fallimento e la tile resta con uno spazio vuoto. Nessuna fonte
// alternativa con licenza chiara e hosting stabile è stata trovata in tempi
// ragionevoli. Soluzione: fallback elegante invece di un rettangolo bianco —
// tile brandizzata con codice set ben leggibile. Stesso fallback riusato ora
// per qualunque set senza logo (mtg/ygo compresi), non solo One Piece.
import { useState } from "react";
import { TCG_LIST } from "../../DraGold.jsx";
import { useReveal } from "../../lib/useReveal.js";
import { loadTcgSets } from "../../lib/tcgSets.js";

function SetTile({ s, tcg, onOpenSet }) {
  const [imgOk, setImgOk] = useState(true);
  const src = s.logoUrl;
  const showImg = !!src && imgOk;

  const open = () => onOpenSet?.({ tcg: s.tcg, set_id: s.setId, lang: "en", set_name: s.setName });

  return (
    <div className="set-card"
      role={onOpenSet ? "button" : undefined} tabIndex={onOpenSet ? 0 : undefined}
      onClick={open}
      onKeyDown={e => { if (onOpenSet && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}>
      <div className="set-card-logo">
        {showImg ? (
          <img src={src} alt="" loading="lazy"
            onError={() => setImgOk(false)}
            onLoad={e => { if (e.currentTarget.naturalWidth === 0) setImgOk(false); }} />
        ) : (
          <div className="set-card-fallback" style={{ color: tcg.color, borderColor: `${tcg.color}33` }}>
            <span className="set-card-fallback-code">{s.setId}</span>
            <span className="set-card-fallback-tcg">{tcg.short}</span>
          </div>
        )}
      </div>
      <div className="set-card-name" title={s.setName}>{s.setName}</div>
      {(s.releaseYear || s.cardCount != null) && (
        <div className="set-card-meta">
          {s.releaseYear || ""}{s.releaseYear && s.cardCount != null ? " · " : ""}
          {s.cardCount != null ? `${s.cardCount} card${s.cardCount === 1 ? "" : "s"}` : ""}
        </div>
      )}
    </div>
  );
}

// Groups an already release-date-sorted list into year buckets (newest
// first). Sets with no known release date land in one trailing "unknown"
// bucket instead of a fabricated year — never invented.
function groupByYear(sets) {
  const groups = [];
  for (const s of sets) {
    const key = s.releaseYear != null ? String(s.releaseYear) : "unknown";
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: s.releaseYear != null ? String(s.releaseYear) : "Release date unknown", items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups;
}

function sortSets(sets) {
  return sets.slice().sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate) : null;
    const db = b.releaseDate ? new Date(b.releaseDate) : null;
    if (da && db) return db - da;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (a.setName || "").localeCompare(b.setName || "");
  });
}

function TcgSection({ tcg, sets, loadState, onLoad, onOpenSet, index }) {
  const reveal = useReveal(index);
  const showYearHeaders = sets.length > 0 && groupByYear(sets).length > 1;
  const groups = groupByYear(sets);

  return (
    <div ref={reveal.ref} className={reveal.className} style={reveal.style}>
      <div className="set-section">
        <div className="sec-h">
          <img src={tcg.logo} alt="" className="set-section-logo" />
          <span className="sec-h-t" style={{ color: tcg.color }}>{tcg.label}</span>
          <span className="sec-h-line" />
          {sets.length > 0 && <span className="explore-count">{sets.length}</span>}
        </div>

        {loadState === "idle" ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLoad}>
            Show {tcg.label} sets
          </button>
        ) : loadState === "loading" ? (
          <div className="set-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skel-card"><div className="skel-img" style={{ aspectRatio: "5/3" }} /></div>
            ))}
          </div>
        ) : sets.length === 0 ? (
          <p className="explore-sub">No sets indexed yet for {tcg.label}.</p>
        ) : (
          groups.map(g => (
            <div key={g.key} style={{ marginBottom: 18 }}>
              {showYearHeaders && <div className="set-year-head">{g.label}</div>}
              <div className="set-grid">
                {g.items.map(s => (
                  <SetTile key={`${s.tcg}:${s.setId}`} s={s} tcg={tcg} onOpenSet={onOpenSet} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SetsView({ setsMap, onOpenSet }) {
  const loading = setsMap == null;
  const allSets = loading ? [] : [...setsMap.values()];

  // Pokémon + One Piece: instant, from the already-cached setsMap.
  const cheapByTcg = {};
  for (const s of allSets) {
    if (!cheapByTcg[s.tcg]) cheapByTcg[s.tcg] = [];
    cheapByTcg[s.tcg].push({
      tcg: s.tcg, setId: s.set_code, setName: s.set_name || s.set_code,
      logoUrl: s.logo_url || s.symbol_url || null,
      releaseDate: s.release_date || null,
      releaseYear: s.release_date ? new Date(s.release_date).getFullYear() : null,
      cardCount: null,
    });
  }

  // MTG + Yu-Gi-Oh! (and any future TCG absent from set_logos): lazy, via
  // lib/tcgSets.js — one fetch per tcg, cached, triggered on demand.
  const [lazySets, setLazySets] = useState({}); // tcg -> array
  const [lazyState, setLazyState] = useState({}); // tcg -> 'idle'|'loading'|'done'

  const loadLazy = (tcgId) => {
    setLazyState(prev => ({ ...prev, [tcgId]: "loading" }));
    loadTcgSets(tcgId).then(({ sets }) => {
      setLazySets(prev => ({ ...prev, [tcgId]: sets.map(s => ({ ...s, tcg: tcgId })) }));
      setLazyState(prev => ({ ...prev, [tcgId]: "done" }));
    });
  };

  const orderedTcgs = TCG_LIST; // priorita' di prodotto gia' incorporata nell'ordine dell'array (CLAUDE.md §1); una 5a riga (es. Lorcana) non richiede refactor qui.
  const totalCheap = Object.values(cheapByTcg).reduce((n, arr) => n + arr.length, 0);

  return (
    <section className="view">
      <div className="explore-head">
        <span className="explore-eyebrow">The catalog, by set</span>
        <h1 className="explore-title">Explore</h1>
        {!loading && totalCheap > 0 && (
          <p className="explore-sub">{totalCheap}+ sets across {orderedTcgs.length} games.</p>
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
      ) : (
        orderedTcgs.map((tcg, i) => {
          const cheap = cheapByTcg[tcg.id];
          const hasCheap = cheap && cheap.length > 0;
          const state = hasCheap ? "done" : (lazyState[tcg.id] || "idle");
          const sets = hasCheap ? sortSets(cheap) : sortSets(lazySets[tcg.id] || []);
          return (
            <TcgSection key={tcg.id} tcg={tcg} sets={sets} loadState={state}
              onLoad={() => loadLazy(tcg.id)} onOpenSet={onOpenSet} index={i} />
          );
        })
      )}
    </section>
  );
}
