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
// Explorer + Catalog Completeness (2026-08-25): the cheap set_logos-based
// path above only ever carried the English/International print of a set —
// Pokémon/One Piece Japanese sets live under a completely different set_id
// namespace (verified on Supabase: pokemon ja uses CP1/E1../M1L/PCG1..,
// nothing like base1/bw1/swshp) and were invisible in Explore. Each TCG now
// gets an extra, separately-lazy "Japanese" subsection, shown only when
// detectJapaneseSets() confirms real ja rows exist for that tcg (checked live
// per tcg, not hardcoded — mtg/ygo are 100% 'en', verified, so they never get
// an empty/dead subsection). One Piece's ja sets share the same real
// set_logos row as their en counterpart (same physical set, two source-id
// spellings — see setSlug.js normalizeSetKey), so they reuse its logo/name
// instead of showing a duplicate identity or an invented asset; Pokémon's ja
// sets have no set_logos match at all (different code namespace), so they
// fall back to the same elegant branded tile already used for mtg/ygo.
//
// Fallback loghi One Piece (STEP 3, verificato il 12/08/2026): i loghi ufficiali
// (en.onepiece-cardgame.com) sono protetti da hotlink — l'immagine "carica" (evento
// load, complete:true) ma restituisce 0×0 px, quindi il solo onError non basta a
// rilevare il fallimento e la tile resta con uno spazio vuoto. Nessuna fonte
// alternativa con licenza chiara e hosting stabile è stata trovata in tempi
// ragionevoli. Soluzione: fallback elegante invece di un rettangolo bianco —
// tile brandizzata con codice set ben leggibile. Stesso fallback riusato ora
// per qualunque set senza logo (mtg/ygo compresi, e ora i set JP di Pokémon),
// non solo One Piece.
//
// Phase 3 — Fase 2 (Ordinamento e filtri Explore, 26/08/2026): aggiunge un
// controllo di ordinamento esplicito (Novità / Alfabetico / Per era) e un
// filtro per tipologia prodotto, sopra i dati già presenti — nessuna nuova
// query, riusa src/lib/setEras.js (era Pokémon verificata 153/153 contro
// set_logos, tipologia prodotto Pokémon/One Piece). "Per era" è significativo
// solo per Pokémon (unico TCG con un vero concetto di blocco/era nei dati
// oggi disponibili — vedi commento in setEras.js): per gli altri TCG il
// controllo resta selezionabile ma la lista non si spezza in sotto-gruppi
// finti, mostra solo l'elenco alfabetico. Il filtro tipologia prodotto è
// per-sezione TCG (le etichette non sono le stesse tra Pokémon e One Piece) e
// appare solo quando quel TCG ha davvero dati di tipologia (mai un filtro
// finto su dati assenti, coerente con CLAUDE.md §9).
import { useState, useEffect, useMemo } from "react";
import { TCG_LIST } from "../../DraGold.jsx";
import { useReveal } from "../../lib/useReveal.js";
import { loadTcgSets, loadLangSets, detectJapaneseSets } from "../../lib/tcgSets.js";
import { getSetEra, getProductType, PRODUCT_TYPE_LABELS } from "../../lib/setEras.js";

const LANG_LABEL = { ja: "JP" };
const SORT_MODES = [
  { id: "date", label: "Novità" },
  { id: "alpha", label: "Alfabetico" },
  { id: "era", label: "Per era" },
];

// Arricchisce un set grezzo con era/eraOrder (solo Pokémon, altrimenti null —
// mai inventata) e productType (Pokémon + One Piece, altrimenti null).
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

// Groups an already-sorted list into buckets depending on sortMode. 'date' ->
// year buckets (newest first, unknown-date sets in one trailing bucket,
// unchanged behaviour). 'era' -> era buckets for Pokémon (newest era first,
// same convention as year buckets); any set without an assigned era (every
// non-Pokémon set today, plus Pokémon JA) falls into a single trailing
// "Altri set" bucket instead of a fabricated era. 'alpha' -> no sub-grouping,
// a single flat bucket (LangGroup already hides headers when there's only one).
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
  // 'date' (default)
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
      if (ea != null && eb != null && ea !== eb) return eb - ea; // era più recente prima
      if (ea != null && eb == null) return -1;
      if (ea == null && eb != null) return 1;
      // stessa era (o nessuna): stesso criterio del sort 'date' come tie-break
      const da = a.releaseDate ? new Date(a.releaseDate) : null;
      const db = b.releaseDate ? new Date(b.releaseDate) : null;
      if (da && db) return db - da;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return (a.setName || "").localeCompare(b.setName || "");
    });
  }
  // 'date' (default)
  return arr.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate) : null;
    const db = b.releaseDate ? new Date(b.releaseDate) : null;
    if (da && db) return db - da;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return (a.setName || "").localeCompare(b.setName || "");
  });
}

// One language group inside a TCG section (International or Japanese).
// `loadState` is undefined for the always-visible International group when
// it's the cheap/instant setsMap path (no button needed); it's a real
// idle/loading/done state for anything lazily fetched (mtg/ygo's only group,
// and every TCG's Japanese group).
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

  // Tipologie prodotto realmente presenti in questa sezione (International +
  // Japanese insieme) — il filtro appare solo se ce n'è più di una, altrimenti
  // sarebbe un controllo senza scelta reale.
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

        {/* International — always the first group. Unlabeled when this TCG
            has no Japanese group at all (mtg/ygo today): a lone
            "International" header would just be noise when there's nothing
            to distinguish it from. */}
        <LangGroup label={jaAvailable ? "International" : null} sets={filteredSets} loadState={loadState}
          onLoad={onLoad} tcg={tcg} onOpenSet={onOpenSet} sortMode={sortMode} />

        {/* Japanese — only rendered once detectJapaneseSets() has confirmed
            real ja rows exist for this tcg. jaAvailable is undefined while
            that check is still in flight, so nothing flashes in/out. */}
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
  // Filtro tipologia prodotto, per tcg (le etichette non sono condivise tra
  // Pokémon e One Piece, quindi non ha senso un unico filtro globale).
  const [productTypeByTcg, setProductTypeByTcg] = useState({}); // tcg -> 'all' | type

  // Pokémon + One Piece: instant, from the already-cached setsMap.
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

  // MTG + Yu-Gi-Oh! (and any future TCG absent from set_logos): lazy, via
  // lib/tcgSets.js — one fetch per tcg, cached, triggered on demand.
  const [lazySets, setLazySets] = useState({}); // tcg -> array
  const [lazyState, setLazyState] = useState({}); // tcg -> 'idle'|'loading'|'done'

  const loadLazy = (tcgId) => {
    setLazyState(prev => ({ ...prev, [tcgId]: "loading" }));
    loadTcgSets(tcgId).then(({ sets }) => {
      setLazySets(prev => ({ ...prev, [tcgId]: sets.map(s => withClassification({ ...s, tcg: tcgId, lang: "en" })) }));
      setLazyState(prev => ({ ...prev, [tcgId]: "done" }));
    });
  };

  // Japanese subsection — one cheap existence check per tcg on mount, then a
  // real (lazy, on-demand) set list only for the TCGs that actually have one.
  const [jaAvail, setJaAvail] = useState({}); // tcg -> true|false (undefined = still checking)
  const [jaSets, setJaSets] = useState({}); // tcg -> array
  const [jaState, setJaState] = useState({}); // tcg -> 'idle'|'loading'|'done'

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
