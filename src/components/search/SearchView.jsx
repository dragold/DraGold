import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseReady } from "../../supabase.js";
import { Icon } from "../shared/Icon.jsx";
import { Onboarding, ONBOARD_KEY } from "../shared/Onboarding.jsx";
import { SearchResults } from "./SearchResults.jsx";
import { HotPicksSection } from "./HotPicksSection.jsx";
import { norm, rankSearchResults, groupByCanonical } from "../../lib/search.js";
import { LANG_ALIASES, RARITY_TOKENS, JP_NAME_ALIASES } from "../../lib/searchData.js";

export function SearchView({ country, cur, eurRate, onOpenAsset, setsMap, initialSearchState, onSearchStateChange, onSearchStateClear, onOpenExplore }) {
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

  const runSearch = useCallback(async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true); setError(null); setSearched(true); setSearchTerm(trimmed); setVisibleCount(40);
    try {
      if (!supabaseReady) throw new Error("Backend non configurato.");
      const normQ = norm(trimmed);
      const hasSpaces = trimmed.includes(' ');
      // Normalizza query: rimuove punteggiatura, splitta in token significativi (≥2 char)
      const words = trimmed.toLowerCase().replace(/[^a-z0-9 ]/gi, ' ')
        .trim().split(/\s+/).filter(w => w.length >= 2);

      let dbQuery = supabase
        .from('cards')
        .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,rarity,canonical_card_id,card_image_cache(cached_url,status)');

      // Separa lang-token (es. "jp","ja","en") dai content-token (es. "charizard","op05").
      // I lang-token NON entrano nell'AND della query DB: le carte JP hanno nome giapponese,
      // quindi name.ilike.*jp* non matcha mai. Vengono risolti e usati nell'expand sotto.
      const LANG_CODES_SET = new Set(['en','ja','it','es','pt','id','ko','fr','de']);
      const langFilterCodes = []; // codici lingua risolti (es. "ja")
      const contentTokens = [];
      for (const w of words) {
        const alias = LANG_ALIASES[w];
        if (alias) { langFilterCodes.push(alias); }
        else if (LANG_CODES_SET.has(w)) { langFilterCodes.push(w); }
        else { contentTokens.push(w); }
      }

      // Limit più alto per ricerche con filtro lingua: serve raccogliere tutti i card_number
      // del set (es. OP05 ha 119 carte) prima dell'expand. Per ricerche normali 80 basta.
      dbQuery = dbQuery.limit(400);

      if (words.length > 0) {
        // Query DB con solo content-token; se tutti lang (raro), usa words originali
        const tokensForQuery = contentTokens.length > 0 ? contentTokens : words;
        for (const w of tokensForQuery) {
          const sw = w.replace(/[*%()]/g, '');
          if (!sw) continue;
          // Token con cifre o trattino → codice set/carta (es. sv03, OP05-119) → cerca ovunque
          // Token solo lettere (es. pikachu, charizard) → cerca SOLO in name
          const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
          const orParts = [`name.ilike.*${sw}*`, `name_en.ilike.*${sw}*`, ...jpA.map(a => `name.ilike.*${a}*`)];
          if (swIsCode) {
            orParts.push(`card_number.ilike.*${sw}*`, `set_name.ilike.*${sw}*`);
          }
          if (RARITY_TOKENS.has(sw)) orParts.push(`rarity.ilike.*${sw}*`);
          // Se il token è un alias/codice lang (solo quando è anche content, es. "en" da solo)
          const la = LANG_ALIASES[sw];
          if (la) orParts.push(`lang.eq.${la}`);
          else if (LANG_CODES_SET.has(sw)) orParts.push(`lang.eq.${sw}`);
          dbQuery = dbQuery.or(orParts.join(','));
        }
      } else {
        const sw = trimmed.replace(/[*%()]/g, '');
        const swIsCode = /\d/.test(sw) || sw.includes('-'); const jpA = JP_NAME_ALIASES[sw] || [];
        dbQuery = dbQuery.or(
          `name.ilike.*${sw}*,name_en.ilike.*${sw}*${jpA.map(a => `,name.ilike.*${a}*`).join('')}${swIsCode ? `,card_number.ilike.*${sw}*,set_name.ilike.*${sw}*` : ''}${sw.length >= 4 && RARITY_TOKENS.has(sw) ? `,rarity.ilike.*${sw}*` : ''}`
        );
      }

      const { data, error: dbErr } = await dbQuery;
      if (dbErr) throw dbErr;

      let nameMatches = data || [];

      // Client-side filter: rimuove falsi positivi da set_name/card_number
      // Per query name-like (solo lettere, es. "pikachu"): richiede match su name
      // Per query codice (es. "sv03", "OP05"): controlla name + card_number
      if (!hasSpaces && normQ.length >= 3) {
        const qIsCode = /\d/.test(normQ) || normQ.includes('-'); const qJpA = JP_NAME_ALIASES[normQ] || [];
        nameMatches = nameMatches.filter(c =>
          norm(c.name || '').includes(normQ) || norm(c.name_en || '').includes(normQ) ||
          (qIsCode && norm(c.card_number || '').includes(normQ)) || (qJpA.length > 0 && qJpA.some(a => (c.name || '').includes(a)))
        );
      }

      let cards = nameMatches;
      if (langFilterCodes.length > 0 && nameMatches.length > 0) {
        // Expand per lingua: cerca versioni nella lingua richiesta usando gli stessi card_number.
        // Necessario perché le carte JP hanno nome giapponese nel DB (non matcha "charizard").
        const byTcg = {};
        for (const c of nameMatches) {
          if (!c.card_number) continue;
          if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
          byTcg[c.tcg].add(c.card_number);
        }
        const allLangCards = [];
        for (const [tcgKey, numSet] of Object.entries(byTcg)) {
          const nums = [...numSet];
          if (!nums.length || nums.length > 400) continue;
          // Usa solo card_number con prefisso set (es. "sv3-125", "OP05-119").
          // I numeri bare (es. "006") causano collisioni cross-set nel DB:
          // Base Set Charizard e Jungle Beedrill condividono entrambi "006".
          const safeNums = nums.filter(n => /^[a-zA-Z].*-\d|^[a-zA-Z]{2,}\d{2,}/.test(n));
          if (!safeNums.length) continue;
          let lq = supabase
            .from('cards')
            .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,rarity,canonical_card_id,card_image_cache(cached_url,status)')
            .eq('tcg', tcgKey)
            .in('card_number', safeNums);
          if (langFilterCodes.length === 1) lq = lq.eq('lang', langFilterCodes[0]);
          else lq = lq.in('lang', langFilterCodes);
          const { data: expanded } = await lq.limit(300);
          for (const c of (expanded || [])) allLangCards.push(c);
        }
        allLangCards.sort((a, b) => {
          const n = (a.card_number || '').localeCompare(b.card_number || '');
          return n !== 0 ? n : (a.name || '').localeCompare(b.name || '');
        });
        cards = allLangCards;
      } else {
        // Multi-language expand: trova versioni linguistiche delle stesse carte.
        // Attiva SOLO per query che sembrano set-code/card-number (es. "OP05", "sv03-006").
        // Per query generiche come "charizard", l'expand causa falsi positivi perché
        // card_number "006" in set diversi appartiene a pokemon completamente diversi.
        const looksLikeCardNum = words.some(w =>
          /^[a-z]{1,5}\d{2,}/i.test(w) || (w.includes('-') && w.length >= 5)
        );
        if (looksLikeCardNum && nameMatches.length > 0) {
          // Raggruppa i card_number per TCG (evita collisioni cross-TCG)
          const byTcg = {};
          for (const c of nameMatches) {
            if (!c.card_number) continue;
            if (!byTcg[c.tcg]) byTcg[c.tcg] = new Set();
            byTcg[c.tcg].add(c.card_number);
          }
          const knownIds = new Set(nameMatches.map(c => c.id));
          const allCards = [...nameMatches];
          for (const [tcgKey, numSet] of Object.entries(byTcg)) {
            const nums = [...numSet];
            if (!nums.length || nums.length > 400) continue;
            const { data: expanded } = await supabase
              .from('cards')
              .select('id,name,name_en,set_name,set_id,card_number,image_url,lang,tcg,canonical_card_id,card_image_cache(cached_url,status)')
              .eq('tcg', tcgKey)
              .in('card_number', nums)
              .limit(400);
            for (const c of (expanded || [])) {
              if (!knownIds.has(c.id)) { knownIds.add(c.id); allCards.push(c); }
            }
          }
          allCards.sort((a, b) => {
            const n = (a.card_number || '').localeCompare(b.card_number || '');
            return n !== 0 ? n : (a.lang || '').localeCompare(b.lang || '');
          });
          cards = allCards;
        }
      }

      // Raggruppa varianti lingua/regione della stessa carta (canonical_card_id, mai
      // similarity di nome — vedi lib/search.js). Non si raggruppa quando l'utente ha
      // chiesto esplicitamente una lingua (langFilterCodes.length>0): in quel caso
      // vuole vedere proprio quell'elenco, non una singola entry collassata.
      if (langFilterCodes.length === 0) cards = groupByCanonical(cards);
      cards = rankSearchResults(cards, trimmed); setResults(cards);
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
      <div className="hero">
        <h1 className="hero-t">Find a card.<br/>Explore the catalog.</h1>
        <p className="hero-s">Pokémon, One Piece, Magic and Yu-Gi-Oh! — search any card, browse sets, and build your collection.</p>
        {onOpenExplore && (
          <button type="button" className="chip" style={{ marginTop: 12 }} onClick={onOpenExplore}>
            Browse sets →
          </button>
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
        <SearchResults
          loading={loading} results={results.slice(0, visibleCount)} priceMap={priceMap}
          error={error} term={searchTerm}
          country={country} cur={cur} eurRate={eurRate}
          onRetry={() => runSearch(searchTerm)}
          onOpen={handleOpenAsset} setsMap={setsMap}
          hasMore={visibleCount < results.length}
          totalCount={results.length}
        />
      ) : (
        <HotPicksSection country={country} cur={cur} eurRate={eurRate} onOpen={handleOpenAsset} />
      )}
    </section>
  );
}
