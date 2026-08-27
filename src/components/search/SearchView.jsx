import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, supabaseReady, listCollection } from "../../supabase.js";
import { Icon } from "../shared/Icon.jsx";
import { Onboarding, ONBOARD_KEY } from "../shared/Onboarding.jsx";
import { SearchResults } from "./SearchResults.jsx";
import { HotPicksSection } from "./HotPicksSection.jsx";
import { CardObject } from "../shared/CardObject.jsx";
import { pickCardImage } from "../shared/cardImage.js";
import { useReveal } from "../../lib/useReveal.js";
import { useDragScroll } from "../../lib/useDragScroll.js";
import { norm, rankSearchResults, groupByCanonical, searchCards } from "../../lib/search.js";
import { LANG_ALIASES, RARITY_TOKENS, JP_NAME_ALIASES } from "../../lib/searchData.js";
import { TCG_LIST } from "../../DraGold.jsx";
import { buildSetSlug } from "../../lib/setSlug.js";
import { setIdCandidates } from "../../pages/set/SetDetailPage.jsx";

export function SearchView({ country, cur, eurRate, onOpenAsset, setsMap, onOpenSet, initialSearchState, onSearchStateChange, onSearchStateClear, onOpenExplore, isAuthed = false }) {
  const [q, setQ] = useState(() => initialSearchState?.q || "");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(() => initialSearchState?.results || []);
  const [priceMap, setPriceMap] = useState(() => initialSearchState?.priceMap || {});
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(() => initialSearchState?.searched || false);
  const [searchTerm, setSearchTerm] = useState(() => initialSearchState?.searchTerm || ""); const [visibleCount, setVisibleCount] = useState(() => initialSearchState?.visibleCount || 40);
  const [showOnboard, setShowOnboard] = useState(() => {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch { return false; }
  });
  const dismissOnboard = () => {
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch {}
    setShowOnboard(false);
  };
  const hotPicksReveal = useReveal();
  const discoverReveal = useReveal(1);
  const resultsReveal = useReveal();
  // Real card art for the hero stack — reuses HotPicksSection's own fetch
  // (via its onPicksLoaded callback) rather than issuing a second query.
  const [heroCards, setHeroCards] = useState([]);
  const discoverDrag = useDragScroll();
  // "Discover sets" rail — reuses the setsMap already loaded once in
  // DraGold.jsx (no new query), ordered by product priority (CLAUDE.md §1:
  // Pokémon → One Piece → MTG/YGO architecture-only, so the latter never
  // surface here unless they actually have logo data). set_logos carries no
  // release-date column, so a genuine "most recent" sort isn't available
  // without inventing one — shuffled per session instead, so the rail
  // doesn't show the same fixed slice of the catalog every visit.
  const discoverSets = useMemo(() => {
    if (!setsMap) return [];
    const byTcg = {};
    for (const s of setsMap.values()) {
      if (!s.logo_url && !s.symbol_url) continue;
      (byTcg[s.tcg] ||= []).push(s);
    }
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const ordered = [];
    for (const t of TCG_LIST) {
      if (t.id === "mtg" || t.id === "ygo") continue;
      for (const s of shuffle(byTcg[t.id] || []).slice(0, 8)) ordered.push({ ...s, _tcgInfo: t });
    }
    return ordered.slice(0, 14);
  }, [setsMap]);

  // Home Discovery — Collection & Set Completion Loop (PRODUCT_SPEC.md §4):
  // real per-set "owned" count for signed-in users on the same Discover-a-set
  // rail, anonymous users get a sign-in CTA instead. Grouped client-side from
  // listCollection() (one query total, not one per set).
  //
  // BUGFIX (verified live on Supabase 2026-08-26): the live `collection`
  // table's real column is `set_name`, NOT `card_set` — migrations/
  // 006_collection_denormalized.sql (which this comment originally cited) is
  // stale versus the actual schema (confirmed via information_schema.columns:
  // collection has id/user_id/binder_id/tcg/card_api_id/card_name/set_name/
  // card_number/rarity/image_url/language/condition/is_graded/grade_company/
  // grade_value/purchase_price/purchase_date/fmv_snapshot/fmv_currency/notes/
  // added_at/quantity — no card_set/card_id/card_img/card_lang at all). Using
  // card_set meant `r?.card_set` was always undefined, so ownedBySet stayed
  // effectively empty for every signed-in user, every set, silently (no
  // error — the badge just never appeared). Per CLAUDE.md §9, flagging this
  // here rather than trusting migrations/ as source of truth: someone should
  // reconcile the versioned migration with the real schema in a dedicated
  // task, this fix only unblocks the feature that depends on it.
  //
  // No fabricated "X/Y complete" percentage here: getting a real total-cards-
  // per-set count for every rail tile would mean a query per set (or a new
  // aggregate RPC) — out of scope for this pass, flagged as a gap in the report
  // rather than invented. SetDetailPage.jsx/SetPage.jsx already show the real
  // X/Y % once a user opens a specific set.
  const [ownedBySet, setOwnedBySet] = useState(null); // Map<"tcg:set_name", count> | null (not loaded / anon)
  useEffect(() => {
    if (!isAuthed) { setOwnedBySet(null); return; }
    let cancelled = false;
    listCollection().then(rows => {
      if (cancelled) return;
      const m = new Map();
      for (const r of (rows || [])) {
        if (!r?.tcg || !r?.set_name) continue;
        const key = `${r.tcg}:${r.set_name}`;
        // quantity, not row count — a row is one unique card, quantity is
        // how many physical copies (same field Portfolio's "×N" uses).
        m.set(key, (m.get(key) || 0) + (r.quantity || 1));
      }
      setOwnedBySet(m);
    }).catch(() => { if (!cancelled) setOwnedBySet(null); });
    return () => { cancelled = true; };
  }, [isAuthed]);

  // Collection Progress ring on the Discover-a-set rail: the real per-set
  // total this file's own earlier comment flagged as a gap ("no fabricated
  // X/Y here... out of scope for this pass"). Closes it the same way
  // SetDetailPage.jsx already gets its real total for one open set --
  // same setIdCandidates() variant-matching, same groupByCanonical() dedup
  // (both already exported from there, reused verbatim here) -- just batched
  // across every tile currently on the rail instead of one query per set:
  // one query per TCG present (today: pokemon + onepiece, 2 total), not one
  // per tile. Public data (total card count of a set), so this runs for
  // every visitor, not gated on isAuthed like ownedBySet above.
  const [totalBySet, setTotalBySet] = useState(new Map()); // Map<"tcg:set_name", total>
  useEffect(() => {
    if (!discoverSets.length) return;
    let cancelled = false;
    const byTcg = new Map();
    for (const s of discoverSets) {
      if (!s.set_name) continue;
      if (!byTcg.has(s.tcg)) byTcg.set(s.tcg, []);
      byTcg.get(s.tcg).push(s);
    }
    (async () => {
      const next = new Map();
      for (const [tcg, tiles] of byTcg) {
        const candidatesByTile = tiles.map(s => ({ s, candidates: setIdCandidates(s.set_code) }));
        const allCandidates = [...new Set(candidatesByTile.flatMap(t => t.candidates))];
        if (!allCandidates.length) continue;
        const { data, error } = await supabase
          .from("cards")
          .select("id,set_id,canonical_card_id")
          .eq("tcg", tcg).eq("lang", "en")
          .in("set_id", allCandidates)
          .limit(4000);
        if (error || !data) continue;
        for (const { s, candidates } of candidatesByTile) {
          const rows = data.filter(r => candidates.includes(r.set_id));
          if (!rows.length) continue;
          next.set(`${tcg}:${s.set_name}`, groupByCanonical(rows).length);
        }
      }
      if (!cancelled) setTotalBySet(next);
    })();
    return () => { cancelled = true; };
  }, [discoverSets]);

  const runSearch = useCallback(async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setSearched(true); setSearchTerm(trimmed); setVisibleCount(40);
    try {
      const cards = await searchCards(trimmed);
      setResults(cards);
      setLoading(false); // mostra le carte subito, prezzi in background

      // Prezzi in background: max 100 IDs per evitare URL troppo lunghi (414/timeout)
      if (cards.length > 0) {
        try {
          const priceIds = cards.slice(0, 100).map(c => c.id);
          const { data: priceRows } = await supabase
            .from('card_prices')
            .select('card_id,price_market,source,captured_at')
            .in('card_id', priceIds)
            .order('captured_at', { ascending: false })
            .limit(priceIds.length * 3);
          const pm = {};
          for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
          setPriceMap(pm);
        } catch (_) { /* ignora errori fetch prezzi */ }
      } else {
        setPriceMap({});
      }
    } catch (e) {
      setError(e.message || "Unknown error.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Salva lo stato di ricerca prima di aprire il dettaglio carta, così il back restaura i risultati
  const handleOpenAsset = useCallback((card) => {
    onSearchStateChange({ q, results, priceMap, searched, searchTerm, visibleCount });
    onOpenAsset(card);
  }, [q, results, priceMap, searched, searchTerm, visibleCount, onOpenAsset]);

  useEffect(() => { const onScroll = () => { if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300) { setVisibleCount(v => Math.min(v + 40, results.length)); } }; window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll); }, [results.length]); const onSubmit = (e) => { e.preventDefault(); runSearch(q); };
  const clearSearch = () => { onSearchStateClear(); setSearched(false); setResults([]); setPriceMap({}); setError(null); setVisibleCount(40); };

  return (
    <section className="view">
      {showOnboard && <Onboarding onDismiss={dismissOnboard} />}
      <div className="hero hero-grid">
        <div>
          <h1 className="hero-t">Find a card.<br/>Explore the <span className="hero-accent">catalog</span>.</h1>
          <p className="hero-s">Pokémon, One Piece, Magic and Yu-Gi-Oh! — search any card, browse sets, and build your collection.</p>
          <div className="hero-cta-row" style={{ marginTop: 12 }}>
            {onOpenExplore && (
              <button type="button" className="chip" onClick={onOpenExplore}>
                Browse sets →
              </button>
            )}
            {/* Card ID entry point (2026-08-26 nav-discoverability fix) —
                the /card-id microproduct existed with no link anywhere in
                the app; this surfaces it from the home hero. Real
                existing route, no new logic. */}
            <a className="chip chip-cardid" href="/card-id">
              <Icon name="camera" size={13}/> Identify a card →
            </a>
            {/* Academy entry point (PRODUCT_SPEC.md §3) — discreet, not a
                primary CTA: the nav bar/tabbar already link to /academy
                (DraGold.jsx), this just surfaces it once more where
                discovery actually starts, same real route, no new logic. */}
            <a className="chip chip-academy" href="/academy">
              <Icon name="spark" size={13}/> Learn in the Academy →
            </a>
          </div>
        </div>
        {heroCards.length > 0 && (
          <div className="hero-stack" aria-hidden="true">
            {heroCards.slice(0, 3).map((c, i) => (
              i === 0 ? (
                <div className="hero-stack-card hero-stack-front" key={c.id}>
                  <CardObject card={c} src={pickCardImage(c) || c.imgUrl || c.img} alt="" variant="grid" fallback={null} />
                </div>
              ) : (
                <div className="hero-stack-card hero-stack-back" key={c.id} data-i={i}>
                  <img src={pickCardImage(c) || c.imgUrl || c.img} alt="" loading="lazy" />
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Fix #2: form submit = invio da tastiera */}
      <form className="search" onSubmit={onSubmit}>
        <span className="search-ic"><Icon name="search" size={20}/></span>
        <input
          className="search-in"
          placeholder="Search a card… (e.g. Charizard, Monkey D Luffy)"
          value={q} onChange={e => setQ(e.target.value)}
          enterKeyHint="search" autoComplete="off"
        />
        {searched && (
          <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search">
            <Icon name="close" size={15}/>
          </button>
        )}
        <button type="submit" className="search-go">Search</button>
      </form>

      {searched ? (
        <div ref={resultsReveal.ref} className={resultsReveal.className} style={resultsReveal.style}>
          <SearchResults
            loading={loading} results={results.slice(0, visibleCount)} priceMap={priceMap}
            error={error} term={searchTerm}
            country={country} cur={cur} eurRate={eurRate}
            onRetry={() => runSearch(searchTerm)}
            onOpen={handleOpenAsset} setsMap={setsMap}
            hasMore={visibleCount < results.length}
            totalCount={results.length}
          />
        </div>
      ) : (
        <div ref={hotPicksReveal.ref} className={hotPicksReveal.className} style={hotPicksReveal.style}>
          <HotPicksSection country={country} cur={cur} eurRate={eurRate} onOpen={handleOpenAsset} onPicksLoaded={setHeroCards} />
        </div>
      )}

      {!searched && discoverSets.length > 0 && (
        <div ref={discoverReveal.ref} className={discoverReveal.className} style={discoverReveal.style}>
          <div className="sec-h sec-h-editorial">
            <span className="sec-h-t">Discover a set</span>
            <span className="sec-h-line" />
          </div>
          <div className="discover-rail" ref={discoverDrag.ref}
            onPointerDown={discoverDrag.onPointerDown} onPointerMove={discoverDrag.onPointerMove}
            onPointerUp={discoverDrag.onPointerUp} onPointerLeave={discoverDrag.onPointerLeave}
            onClickCapture={discoverDrag.onClickCapture}>
            {discoverSets.map(s => {
              const owned = ownedBySet?.get(`${s.tcg}:${s.set_name}`) || 0;
              const setSlug = buildSetSlug(s.tcg, s.set_code);
              return (
                <a key={`${s.tcg}:${s.set_code}`} className="discover-tile"
                  href={setSlug ? `/set/${setSlug}` : undefined}
                  onClick={e => { e.preventDefault(); onOpenSet?.({ tcg: s.tcg, set_id: s.set_code, lang: "en", set_name: s.set_name }); }}
                  style={{ '--tcg-color': s._tcgInfo?.color }}>
                  {(s.logo_url || s.symbol_url) && (
                    <img src={s.logo_url || s.symbol_url} alt="" loading="lazy"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <span className="discover-tile-name">{s.set_name || s.set_code}</span>
                  <span className="discover-tile-tcg">{s._tcgInfo?.short}</span>
                  {/* Collection & Set Completion Loop (PRODUCT_SPEC.md §4) —
                      real "owned" count for signed-in users who already have
                      cards from this set (ownedBySet, computed above from
                      the user's real collection rows — no invented total/%
                      here, see the useEffect's comment for why). */}
                  {owned > 0 && (() => {
                    const total = totalBySet.get(`${s.tcg}:${s.set_name}`) || 0;
                    if (total > 0) {
                      const pct = Math.min(100, Math.round((owned / total) * 100));
                      return (
                        <span className="discover-tile-ring" style={{ '--pct': `${pct}%` }} title={`${owned} of ${total} collected`}>
                          <span className="discover-tile-ring-inner">
                            <span className="discover-tile-ring-n">{owned}<small>/{total}</small></span>
                          </span>
                        </span>
                      );
                    }
                    // Total not resolved yet (still loading, or this set's
                    // cards.set_id didn't match any candidate) -- same
                    // graceful fallback as before, real data only.
                    return <span className="discover-tile-owned">{owned} owned</span>;
                  })()}
                </a>
              );
            })}
          </div>
          {!isAuthed && (
            <p className="discover-rail-cta">
              <a href="/register">Create a free account</a> to track which cards you own in each set.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
