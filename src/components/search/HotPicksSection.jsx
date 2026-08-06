import { useState, useEffect } from "react";
import { supabase, supabaseReady } from "../../supabase.js";
import { Icon } from "../shared/Icon.jsx";
import { SearchResultItem } from "./SearchResultItem.jsx";

export function HotPicksSection({ country = "IT", cur = "EUR", eurRate = 0.92, onOpen }) {
  // Fallback curato: carte reali del catalogo (id verificati in DB), usato solo se
  // hot_picks non ha ancora righe per oggi (es. cron non ancora girato) o ne ha poche.
  // Niente più chiamate live a eBay: prezzo letto da card_prices via card_prices_latest.
  const FALLBACK_IDS = [
    'pokemon:tcgdex:me02-013:en', // Mega Charizard X ex
    'pokemon:tcgdex:xy6-76:en', // M Rayquaza EX
    'onepiece:optcg:ST18-005:en', // Luffy-Tarou SR
    'onepiece:optcg:OP01-121:en', // Yamato SEC (Romance Dawn)
  ];

  const [picks, setPicks] = useState([]);
  const [loadingPicks, setLoadingPicks] = useState(true);
  const CACHE_KEY = 'dg_hotpicks_v4';
  const CACHE_TTL = 30 * 60 * 1000;

  useEffect(() => {
    if (!supabaseReady) { setLoadingPicks(false); return; }
    let cancelled = false;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
      if (c.ts && Date.now() - c.ts < CACHE_TTL && c.data?.length) {
        setPicks(c.data); setLoadingPicks(false); return;
      }
    } catch {}
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: hp } = await supabase
          .from('hot_picks')
          .select('rank, card_id, delta_pct, current_price')
          .eq('computed_date', today)
          .order('rank', { ascending: true })
          .limit(12);

        const hpRows = hp || [];
        const haveIds = new Set(hpRows.map(r => r.card_id));
        const fillIds = FALLBACK_IDS.filter(id => !haveIds.has(id));
        const neededIds = [...hpRows.map(r => r.card_id), ...fillIds];

        let cardsById = {};
        if (neededIds.length) {
          const { data: cardsRows } = await supabase
            .from('cards')
            .select('id,name,set_name,card_number,tcg,lang,image_url,image_url_hi,card_image_cache(cached_url,status)')
            .in('id', neededIds);
          for (const c of (cardsRows || [])) cardsById[c.id] = c;
        }

        const fromHotPicks = hpRows
          .filter(r => cardsById[r.card_id])
          .map(r => ({ ...cardsById[r.card_id], avgPrice: r.current_price }));

        let fromFallback = [];
        if (fillIds.length) {
          const { data: priceRows } = await supabase
            .from('card_prices')
            .select('card_id,price_market,captured_at')
            .in('card_id', fillIds)
            .order('captured_at', { ascending: false });
          const latestPrice = {};
          for (const p of (priceRows || [])) { if (!(p.card_id in latestPrice)) latestPrice[p.card_id] = p.price_market; }
          fromFallback = fillIds
            .filter(id => cardsById[id])
            .map(id => ({ ...cardsById[id], avgPrice: latestPrice[id] ?? null }));
        }

        const combined = [...fromHotPicks, ...fromFallback].slice(0, 12);
        if (!cancelled) {
          setPicks(combined);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: combined })); } catch {}
        }
      } catch {}
      finally { if (!cancelled) setLoadingPicks(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="sec-h">
        <span className="sec-h-t"><Icon name="spark" size={14} /> Hot picks</span>
        <span className="sec-h-line" />
      </div>
      {loadingPicks ? (
        <div className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skel-card">
              <div className="skel-img" /><div className="skel-line w70" /><div className="skel-line w40" />
            </div>
          ))}
        </div>
      ) : picks.length > 0 ? (
        <div className="card-grid">
          {picks.map(card => (
            <SearchResultItem key={card.id} card={card} priceInfo={null}
              country={country} cur={cur} eurRate={eurRate} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="hint-center">Hot picks updating. Start by searching a card above.</p>
      )}
    </>
  );
}
