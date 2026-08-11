// DraGold — Set Detail (Phase 1 post-P0, validato da DraGold-Next-Evolution-Research.md).
// Destinazione del link "vedi set" da Card Detail. Scope v1 deliberatamente limitato
// a UNA lingua per volta (quella della carta di provenienza): interrogare un set
// senza filtro lingua produce migliaia di righe duplicate cross-lingua (verificato
// su Supabase l'11/08/2026, es. set "sv04" = 266 carte × 6 lingue = 1596 righe).
// Drill-down da Explore/Sets (click su un set senza carta di partenza, quindi senza
// lingua di default) resta fuori scope: decisione rimandata (vedi ricerca, punto Z).
import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseReady } from "../../supabase.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { SearchResults } from "../../components/search/SearchResults.jsx";

const SET_CARD_FIELDS = "id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,canonical_card_id,card_image_cache(cached_url,status)";

function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const pa = String(a || "").match(re) || [];
  const pb = String(b || "").match(re) || [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || "", y = pb[i] || "";
    const nx = parseInt(x, 10), ny = parseInt(y, 10);
    if (!isNaN(nx) && !isNaN(ny)) { if (nx !== ny) return nx - ny; }
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function SetDetailPage({ setRef, setsMap, country, cur, eurRate, onOpen, onBack }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);

  const info = setsMap?.get(`${setRef.tcg}:${setRef.set_id}`) || null;
  const setName = setRef.set_name || info?.set_name || setRef.set_id;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!supabaseReady) throw new Error("Backend non configurato.");
      const { data, error: dbErr } = await supabase
        .from("cards")
        .select(SET_CARD_FIELDS)
        .eq("tcg", setRef.tcg).eq("set_id", setRef.set_id).eq("lang", setRef.lang)
        .limit(600);
      if (dbErr) throw dbErr;
      const sorted = (data || []).slice().sort((a, b) => naturalCompare(a.card_number, b.card_number));
      setCards(sorted);
      setVisibleCount(60);
    } catch (e) {
      setError(e.message || "Unknown error.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [setRef.tcg, setRef.set_id, setRef.lang]);

  useEffect(() => { load(); window.scrollTo({ top: 0, behavior: "auto" }); }, [load]);

  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300) {
        setVisibleCount(v => Math.min(v + 60, cards.length));
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [cards.length]);

  return (
    <section className="view">
      <button className="back-btn" onClick={onBack}>
        <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={18} /></span>
        Back
      </button>

      <div className="set-detail-head">
        {info?.logo_url && (
          <img src={info.logo_url} alt={setName} className="set-logo-img"
            onError={e => { e.currentTarget.style.display = "none"; }} />
        )}
        <div className="view-h" style={{ margin: 0 }}>
          <h2 className="view-t">{setName}</h2>
        </div>
        {setRef.lang && <span className="asset-num">{setRef.lang.toUpperCase()}</span>}
      </div>

      <SearchResults
        loading={loading} results={cards.slice(0, visibleCount)} priceMap={{}}
        error={error} term={setName}
        country={country} cur={cur} eurRate={eurRate}
        onRetry={load} onOpen={onOpen} setsMap={setsMap}
        hasMore={visibleCount < cards.length}
        totalCount={cards.length}
        discoveryMode
      />
    </section>
  );
}
