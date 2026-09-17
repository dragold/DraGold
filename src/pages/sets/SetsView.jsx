// DraGold — Explore/Sets (Explorer/Set-Experience feature, builds on v1 P0-D).
//
// MVP Set Selector (Task 2): Integrated into SetsView. The SetSelector component
// offers the 6 MVP sets (OP-01, OP-02, EB-01, EB-02, SV07, SV08) with one click
// navigation to /set/{slug} (Standalone SetPage with completion, owned/missing,
// prices, estimated value). Below the selector, the full Explore grid shows all
// sets grouped by TCG, year, and product type — clicking a tile opens SetDetailPage
// inside the shell (different destination: SetDetailPage uses setRef with tcg/set_id,
// SetPage uses slug-based routing).
//
// The SetSelector uses loadTcgSets (TCGdex API) for MVP sets that may not be in
// setsMap (e.g., EB-01, EB-02), ensuring all 6 MVP sets are available regardless
// of Supabase set_logos coverage. Non-MVP sets use the existing setsMap/language
// sets paths (pokemon/onepiece from set_logos, mtg/ygo lazy via loadTcgSets).
//
// Integration point: SetSelector sits at the top of SetsView as a "Pick a Set"
// panel. When user clicks an MVP set card, we navigate to /set/{slug} (standalone
// SetPage). When user clicks a tile in the TCG grid below, onOpenSet(ref) opens
// SetDetailPage inside the shell (existing behavior, NOT changed).
//
// IMPORTANT: Do NOT refactor SetsView. Only add the SetSelector panel at the top.
// Keep all existing sorting, filtering, lazy-loading, Japanese subsection logic.
import { useState, useEffect, useMemo } from "react";
import { TCG_LIST } from "../../DraGold.jsx";
import { useReveal } from "../../lib/useReveal.js";
import { loadTcgSets, loadLangSets, detectJapaneseSets } from "../../lib/tcgSets.js";
import { getSetEra, getProductType, PRODUCT_TYPE_LABELS } from "../../lib/setEras.js";
import { SetSelector } from "../../components/set/SetSelector.jsx";

const LANG_LABEL = { ja: "JP" };
const SORT_MODES = [
  { id: "date", label: "Novità" },
  { id: "alpha", label: "Alfabetico" },
  { id: "era", label: "Per era" },
];

function withClassification(s) {
  const eraInfo = getSetEra(s.tcg, s.setId);
  return {
    ...s,
    era: eraInfo?.era || null,
    eraOrder: eraInfo?.eraOrder ?? null,
    productType: getProductType(s.tcg, s.setId, s.setName),
  };
}

function SetTile({ s, tcg, onOpenSet }) {
  const [imgOk, setImgOk] = useState(true);
  const src = s.logoUrl;
  const showImg = !!src && imgOk;

  const open = () => onOpenSet?.({
    tcg: s.tcg, set_id: s.setId, lang: s.lang || "en", set_name: s.setName,
    logo_url: s.logoUrl || null,
  });

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
      <div className="set-card-name" title={s.setName}>
        {s.setName}
        {s.lang && LANG_LABEL[s.lang] && <span className="set-card-lang">{LANG_LABEL[s.lang]}</span>}
      </div>
      {(s.releaseYear || s.cardCount != null) && (
        <div className="set-card-meta">
          {s.releaseYear || ""}{s.releaseYear && s.cardCount != null ? " · " : ""}
          {s.cardCount != null ? `${s.cardCount} card${s.cardCount === 1 ? "" : "s"}` : ""}
        </div>
      )}
    </div>
  );
}

function groupSets(sets, sortMode) {
  if (sortMode === "alpha") {
    return sets.length ? [{ key: "all", label: null, items: sets }] : [];
  }
  if (sortMode === "era") {
    const groups = [];
    for (const s of sets) {
      const key = s.era || "unknown";
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: s.era || "Altri set", items: [] };
        groups.push(g);
      }
      g.items.push(s);
    }
    return groups;
  }
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

function sortSets(sets, sortMode) {
  const arr = sets.slice();
  if (sortMode === "alpha") {
    return arr.sort((a, b) => (a.setName || "").localeCompare(b.setName || ""));
  }
  if (sortMode === "era") {
    return arr.sort((a, b) => {
      const ea = a.eraOrder, eb = b.eraOrder;
      if (ea != null && eb != null && ea !== eb) return eb - ea;
      if (ea != null && eb == null) return -1;
      if (ea == null && eb != null) return 1;
      const da = a.releaseDate ? new Date(a.releaseDate) : null;
      const db = b.releaseDate ? new Date(b.releaseDate) : null;
      if (da && db) return db - da;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return (a.setName || "").localeCompare(b.setName || "");
    });
  }
  return arr.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate) : null;
    const db = b.releaseDate ? new Date(b.releaseDate) : null;
    if (da && db) return db - da;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (a.setName || "").localeCompare(b.setName || "");
  });
}

function LangGroup({ label, sets, loadState, onLoad, tcg, onOpenSet, emptyLabel, sortMode }) {
  const groups = groupSets(sets, sortMode);
  const showGroupHeaders = sets.length > 0 && groups.length > 1;

  return (
    <div className="set-lang-group">
      {label && (
        <div className="set-lang-head">
          <span>{label}</span>
          {sets.length > 0 && <span className="explore-count">{sets.length}</span>}
        </div>
      )}
      {loadState === "idle" ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLoad}>
          Show {label || tcg.label} sets
        </button>
      ) : loadState === "loading" ? (
        <div className="set-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel-card"><div className="skel-img" style={{ aspectRatio: "5/3" }} /></div>
          ))}
        </div>
      ) : sets.length === 0 ? (
        <p className="explore-sub">{emptyLabel || `No sets indexed yet for ${tcg.label}.`}</p>
      ) : (
        groups.map(g => (
          <div key={g.key} style={{ marginBottom: 18 }}>
            {showGroupHeaders && g.label && <div className="set-year-head">{g.label}</div>}
            <div className="set-grid">
              {g.items.map(s => (
                <SetTile key={`${s.tcg}:${s.lang || "en"}:${s.setId}`} s={s} tcg={tcg} onOpenSet={onOpenSet} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TcgSection({
  tcg, sets, loadState, onLoad, onOpenSet, index, jaAvailable, jaSets, jaLoadState, onLoadJa,
  sortMode, productTypeFilter, onProductTypeChange,
}) {
  const reveal = useReveal(index);

  const availableTypes = useMemo(() => {
    const found = new Set();
    for (const s of [...sets, ...(jaSets || [])]) if (s.productType) found.add(s.productType);
    return [...found];
  }, [sets, jaSets]);

  const applyFilter = (list) => productTypeFilter === "all"
    ? list
    : list.filter(s => s.productType === productTypeFilter);

  const filteredSets = applyFilter(sets);
  const filteredJaSets = applyFilter(jaSets || []);

  return (
    <div ref={reveal.ref} className={reveal.className} style={reveal.style}>
      <div className="set-section">
        <div className="sec-h">
          <img src={tcg.logo} alt="" className="set-section-logo" />
          <span className="sec-h-t" style={{ color: tcg.color }}>{tcg.label}</span>
          <span className="sec-h-line" />
          {sets.length > 0 && <span className="explore-count">{sets.length + (jaSets?.length || 0)}</span>}
        </div>

        {availableTypes.length > 1 && (
          <div className="set-type-filter" role="group" aria-label={`Tipologia prodotto ${tcg.label}`}>
            <button type="button"
              className={`set-type-chip ${productTypeFilter === "all" ? "on" : ""}`}
              onClick={() => onProductTypeChange("all")}>Tutti</button>
            {availableTypes.map(t => (
              <button key={t} type="button"
                className={`set-type-chip ${productTypeFilter === t ? "on" : ""}`}
                onClick={() => onProductTypeChange(t)}>
                {PRODUCT_TYPE_LABELS[t] || t}
              </button>
            ))}
          </div>
        )}

        <LangGroup label={jaAvailable ? "International" : null} sets={filteredSets} loadState={loadState}
          onLoad={onLoad} tcg={tcg} onOpenSet={onOpenSet} sortMode={sortMode} />

        {jaAvailable && (
          <LangGroup label="Japanese" sets={filteredJaSets} loadState={jaLoadState}
            onLoad={onLoadJa} tcg={tcg} onOpenSet={onOpenSet} sortMode={sortMode}
            emptyLabel={`No Japanese sets indexed yet for ${tcg.label}.`} />
        )}
      </div>
    </div>
  );
}

export function SetsView({ setsMap, onOpenSet }) {
  const loading = setsMap == null;
  const allSets = loading ? [] : [...setsMap.values()];

  const [sortMode, setSortMode] = useState("date");
  const [productTypeByTcg, setProductTypeByTcg] = useState({});

  const cheapByTcg = {};
  for (const s of allSets) {
    if (!cheapByTcg[s.tcg]) cheapByTcg[s.tcg] = [];
    cheapByTcg[s.tcg].push(withClassification({
      tcg: s.tcg, setId: s.set_code, setName: s.set_name || s.set_code,
      logoUrl: s.logo_url || s.symbol_url || null,
      releaseDate: s.release_date || null,
      releaseYear: s.release_date ? new Date(s.release_date).getFullYear() : null,
      cardCount: null,
      lang: "en",
    }));
  }

  const [lazySets, setLazySets] = useState({});
  const [lazyState, setLazyState] = useState({});

  const loadLazy = (tcgId) => {
    setLazyState(prev => ({ ...prev, [tcgId]: "loading" }));
    loadTcgSets(tcgId).then(({ sets }) => {
      setLazySets(prev => ({ ...prev, [tcgId]: sets.map(s => withClassification({ ...s, tcg: tcgId, lang: "en" })) }));
      setLazyState(prev => ({ ...prev, [tcgId]: "done" }));
    });
  };

  const [jaAvail, setJaAvail] = useState({});
  const [jaSets, setJaSets] = useState({});
  const [jaState, setJaState] = useState({});

  useEffect(() => {
    let alive = true;
    for (const tcg of TCG_LIST) {
      detectJapaneseSets(tcg.id).then(has => {
        if (!alive) return;
        setJaAvail(prev => ({ ...prev, [tcg.id]: has }));
      });
    }
    return () => { alive = false; };
  }, []);

  const loadJa = (tcgId) => {
    setJaState(prev => ({ ...prev, [tcgId]: "loading" }));
    loadLangSets(tcgId, "ja").then(({ sets }) => {
      setJaSets(prev => ({ ...prev, [tcgId]: sets.map(s => withClassification({ ...s, tcg: tcgId })) }));
      setJaState(prev => ({ ...prev, [tcgId]: "done" }));
    });
  };

  const orderedTcgs = TCG_LIST;
  const totalCheap = Object.values(cheapByTcg).reduce((n, arr) => n + arr.length, 0);

  const navigateToSetPage = (slug) => {
    window.location.href = `/set/${slug}`;
  };

  return (
    <section className="view">
      <div className="explore-head">
        <span className="explore-eyebrow">The catalog, by set</span>
        <h1 className="explore-title">Explore</h1>
        {!loading && totalCheap > 0 && (
          <p className="explore-sub">{totalCheap}+ sets across {orderedTcgs.length} games.</p>
        )}
      </div>

      <SetSelector onSelectSet={navigateToSetPage} />

      {!loading && (
        <div className="explore-controls">
          <div className="explore-jump" role="group" aria-label="Vai a">
            {orderedTcgs.map(tcg => (
              <a key={tcg.id} href={`#explore-${tcg.id}`} className="explore-jump-chip" style={{ "--jc": tcg.color }}>
                {tcg.short}
              </a>
            ))}
          </div>
          <div className="explore-sort" role="group" aria-label="Ordina per">
            {SORT_MODES.map(m => (
              <button key={m.id} type="button"
                className={`set-type-chip ${sortMode === m.id ? "on" : ""}`}
                onClick={() => setSortMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
          const sets = hasCheap ? sortSets(cheap, sortMode) : sortSets(lazySets[tcg.id] || [], sortMode);
          const jaAvailable = jaAvail[tcg.id] === true;
          return (
            <div key={tcg.id} id={`explore-${tcg.id}`}>
              <TcgSection tcg={tcg} sets={sets} loadState={state}
                onLoad={() => loadLazy(tcg.id)} onOpenSet={onOpenSet} index={i}
                jaAvailable={jaAvailable}
                jaSets={sortSets(jaSets[tcg.id] || [], sortMode)}
                jaLoadState={jaState[tcg.id] || "idle"}
                onLoadJa={() => loadJa(tcg.id)}
                sortMode={sortMode}
                productTypeFilter={productTypeByTcg[tcg.id] || "all"}
                onProductTypeChange={(t) => setProductTypeByTcg(prev => ({ ...prev, [tcg.id]: t }))}
              />
            </div>
          );
        })
      )}
    </section>
  );
}
