// DraGold — Set Detail (Phase 1 post-P0, validato da DraGold-Next-Evolution-Research.md).
// Destinazione del link "vedi set" da Card Detail E del click su una tile di Explore.
// Scope v1 deliberatamente limitato a UNA lingua per volta: interrogare un set senza
// filtro lingua produce migliaia di righe duplicate cross-lingua (verificato su
// Supabase l'11/08/2026, es. set "sv04" = 266 carte × 6 lingue = 1596 righe).
//
// set_id scheme mismatch (verificato su Supabase il 12/08/2026): `set_logos.set_code`
// (fonte pokemontcg.io/TCGdex "pretty" per Explore) e `cards.set_id` (fonte reale della
// carta, per TCG) non sempre coincidono carattere per carattere pur riferendosi allo
// stesso set reale:
//   - Pokémon: match diretto case-sensitive 153/153 (nessun problema in pratica).
//   - One Piece: match diretto 0/31 ("OP01" vs "op01", "ST01" vs "ST-01"), ma
//     normalizzando (minuscolo + rimozione non-alfanumerici) risolve 31/31.
// Soluzione minima scelta: invece di un bridge/tabella di mapping, generiamo in memoria
// un piccolo set di varianti plausibili dell'ID (maiuscole/minuscole, con/senza trattino)
// e interroghiamo con `.in("set_id", varianti)`. Zero nuove dipendenze, zero nuove
// tabelle, zero migrazioni — solo normalizzazione stringa lato client.
//
// Gap cosmetico (chiuso il 12/08/2026): quando si arriva qui da Card Detail con una
// carta tcgdex non-EN/JA, `card.set_name` è null (pattern noto: tcgdex valorizza
// set_name solo per lang 'en'/'ja') e setsMap può non avere il set_id di quella carta
// (stesso mismatch di schema di cui sopra). In quel caso, e SOLO in quel caso, `load()`
// esegue una query aggiuntiva minima (stesso set_id/varianti, lang='en') per recuperare
// un nome leggibile invece di mostrare il codice grezzo nell'header.
import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseReady } from "../../supabase.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { SearchResults } from "../../components/search/SearchResults.jsx";
import { useReveal } from "../../lib/useReveal.js";
import { TCG_LIST, CARD_LANGS } from "../../DraGold.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import { groupByCanonical } from "../../lib/search.js";
import { CardObject } from "../../components/shared/CardObject.jsx";
import { useDragScroll } from "../../lib/useDragScroll.js";

const SET_CARD_FIELDS = "id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,canonical_card_id,card_image_cache(cached_url,status)";

// Genera le varianti plausibili di un set_id/set_code per coprire le differenze di
// schema note tra fonti (case, trattino tra lettere e cifre). Vedi commento in testa
// al file per i dati di verifica.
function setIdCandidates(code) {
  const c = String(code || "").trim();
  if (!c) return [];
  const variants = new Set([c, c.toLowerCase(), c.toUpperCase()]);
  const m = c.match(/^([A-Za-z]+)-?(\d.*)$/);
  if (m) {
    const [, letters, digits] = m;
    for (const L of [letters, letters.toUpperCase(), letters.toLowerCase()]) {
      variants.add(`${L}-${digits}`);
      variants.add(`${L}${digits}`);
    }
  }
  return [...variants];
}

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
  // Fallback nome set (vedi commento in testa al file, blocco "gap cosmetico"):
  // usato solo quando arriviamo qui da una carta tcgdex non-EN/JA con set_name
  // nullo e setsMap non ha un logo/nome per quello set_id. Query aggiuntiva
  // leggera, eseguita SOLO in quel caso raro — nessun impatto sugli altri flussi.
  const [fallbackName, setFallbackName] = useState(null);

  const info = setsMap?.get(`${setRef.tcg}:${setRef.set_id}`) || null;
  const setName = setRef.set_name || info?.set_name || fallbackName || setRef.set_id;
  const gridReveal = useReveal();
  const constellationReveal = useReveal();
  const previewDrag = useDragScroll();
  const satelliteDrag = useDragScroll();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!supabaseReady) throw new Error("Backend non configurato.");
      const candidates = setIdCandidates(setRef.set_id);
      const { data, error: dbErr } = await supabase
        .from("cards")
        .select(SET_CARD_FIELDS)
        .eq("tcg", setRef.tcg).in("set_id", candidates).eq("lang", setRef.lang)
        .limit(600);
      if (dbErr) throw dbErr;
      // Pokémon cards are ingested from two independent source pipelines
      // (tcgdex + pokemontcg.io) that each write their own row for the same
      // physical card, linked by a shared canonical_card_id — verified on
      // Supabase 13/08/2026: e.g. Fossil (base3) has 2 rows per card_number,
      // one per source, same canonical_card_id. SearchView already collapses
      // this via groupByCanonical for search results; this page queried the
      // raw rows directly and never did, so every card in an affected set
      // (most Pokémon sets — One Piece is unaffected, single source) showed
      // twice. Same dedup as search, applied here.
      const deduped = groupByCanonical(data || []);
      const sorted = deduped.slice().sort((a, b) => naturalCompare(a.card_number, b.card_number));
      setCards(sorted);
      setVisibleCount(60);

      if (!setRef.set_name && !info?.set_name) {
        const { data: nameRows } = await supabase
          .from("cards")
          .select("set_name")
          .eq("tcg", setRef.tcg).in("set_id", candidates).eq("lang", "en")
          .not("set_name", "is", null)
          .limit(1);
        setFallbackName(nameRows?.[0]?.set_name || null);
      } else {
        setFallbackName(null);
      }
    } catch (e) {
      setError(e.message || "Unknown error.");
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [setRef.tcg, setRef.set_id, setRef.lang, setRef.set_name, info?.set_name]);

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
        <span className="set-detail-eyebrow">
          {(TCG_LIST.find(t => t.id === setRef.tcg)?.label || setRef.tcg)}
          {setRef.lang && ` · ${(CARD_LANGS.find(l => l.c === setRef.lang)?.label || setRef.lang.toUpperCase())}`}
          {!loading && ` · ${cards.length} card${cards.length !== 1 ? "s" : ""}`}
        </span>
        <div className="set-detail-row">
          {info?.logo_url && (
            <img src={info.logo_url} alt={setName} className="set-logo-img"
              onError={e => { e.currentTarget.style.display = "none"; }} />
          )}
          <div className="view-h" style={{ margin: 0 }}>
            <h2 className="view-t">{setName}</h2>
          </div>
        </div>
        {cards.length > 0 && (
          <div className="set-preview-strip" ref={previewDrag.ref}
            onPointerDown={previewDrag.onPointerDown} onPointerMove={previewDrag.onPointerMove}
            onPointerUp={previewDrag.onPointerUp} onPointerLeave={previewDrag.onPointerLeave}
            onClickCapture={previewDrag.onClickCapture}>
            {cards.slice(0, 18).map(c => {
              const img = pickCardImage(c) || c.imgUrl || c.img;
              return img ? <div className="set-preview-card" key={c.id}><img src={img} alt="" loading="lazy" /></div> : null;
            })}
          </div>
        )}
      </div>

      {/* The catalog comes first — this is what most visitors came for. */}
      {cards.length > 0 && (
        <div className="sec-h" style={{ marginTop: 34 }}>
          <span className="sec-h-t">All cards</span>
          <span className="sec-h-line" />
        </div>
      )}

      <div ref={gridReveal.ref} className={gridReveal.className} style={gridReveal.style}>
        <SearchResults
          loading={loading} results={cards.slice(0, visibleCount)} priceMap={{}}
          error={error} term={setName}
          country={country} cur={cur} eurRate={eurRate}
          onRetry={load} onOpen={onOpen} setsMap={setsMap}
          hasMore={visibleCount < cards.length}
          totalCount={cards.length}
          discoveryMode
        />
      </div>

      {/* The constellation — relationships, not inventory. A protagonist
          card with the set's own network gathered around it (same-set is
          the one relationship this page's data actually supports — labeled
          honestly, nothing fabricated). Desktop: a real orbit in space.
          Mobile: protagonist + a touch rail, its own composition rather
          than a squeezed copy of the desktop layout. */}
      {cards.length > 3 && (() => {
        const protagonist = cards[0];
        const satellites = cards.slice(1, 11);
        return (
          <div ref={constellationReveal.ref} className={constellationReveal.className} style={constellationReveal.style}>
            <div className="sec-h sec-h-editorial" style={{ marginTop: 40 }}>
              <span className="sec-h-t">The constellation</span>
              <span className="sec-h-line" />
              <span className="edge-label" style={{ margin: 0 }}>SET → CARD</span>
            </div>
            <div className="constellation-orbit">
              <span className="constellation-ring" aria-hidden="true" />
              <button type="button" className="constellation-protagonist" onClick={() => onOpen?.(protagonist)} title={protagonist.name}>
                <CardObject card={protagonist} variant="hero" fallback={null} />
              </button>
              <div className="constellation-satellites" ref={satelliteDrag.ref}
                onPointerDown={satelliteDrag.onPointerDown} onPointerMove={satelliteDrag.onPointerMove}
                onPointerUp={satelliteDrag.onPointerUp} onPointerLeave={satelliteDrag.onPointerLeave}
                onClickCapture={satelliteDrag.onClickCapture}>
                {satellites.map((c, i) => {
                  const img = pickCardImage(c) || c.imgUrl || c.img;
                  return (
                    <button type="button" key={c.id} className="constellation-satellite"
                      style={{ '--angle': `${(360 / satellites.length) * i}deg` }}
                      onClick={() => onOpen?.(c)} title={c.name}>
                      {img ? <img src={img} alt="" loading="lazy" /> : <span className="constellation-node-ph" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
