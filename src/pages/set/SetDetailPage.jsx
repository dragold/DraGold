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
import { useDragScroll } from "../../lib/useDragScroll.js";
import { TCG_LIST, CARD_LANGS } from "../../DraGold.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import { groupByCanonical } from "../../lib/search.js";
import { CardObject } from "../../components/shared/CardObject.jsx";

const SET_CARD_FIELDS = "id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,canonical_card_id,series_name,card_image_cache(cached_url,status)";

// Genera le varianti plausibili di un set_id/set_code per coprire le differenze di
// schema note tra fonti (case, trattino tra lettere e cifre). Vedi commento in testa
// al file per i dati di verifica.
// Esportata anche per riuso in setPageData.js (Block 5 — /set/:slug SEO page):
// stesso problema di mismatch set_id tra fonti, stessa soluzione, zero duplicazione.
export function setIdCandidates(code) {
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

// Esportata anche per riuso in setPageData.js/SetPage.jsx (Block 5).
export function naturalCompare(a, b) {
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

export function SetDetailPage({ setRef, setsMap, country, cur, eurRate, onOpen, onBack, isAuthed }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);
  // Completion — which of this set's cards the signed-in user already owns.
  // RLS on `collection` scopes rows to auth.uid() automatically (same
  // pattern as supabase.js's listCollection()), so no user id needs to be
  // threaded through — just gate the query on isAuthed to skip it for
  // anonymous visitors. Real data only: skipped entirely, not zeroed out,
  // when the user isn't signed in.
  const [ownedIds, setOwnedIds] = useState(null);
  // Fallback nome set (vedi commento in testa al file, blocco "gap cosmetico"):
  // usato solo quando arriviamo qui da una carta tcgdex non-EN/JA con set_name
  // nullo e setsMap non ha un logo/nome per quello set_id. Query aggiuntiva
  // leggera, eseguita SOLO in quel caso raro — nessun impatto sugli altri flussi.
  const [fallbackName, setFallbackName] = useState(null);

  const info = setsMap?.get(`${setRef.tcg}:${setRef.set_id}`) || null;
  const setName = setRef.set_name || info?.set_name || fallbackName || setRef.set_id;
  // Explorer + Catalog Completeness (2026-08-25): setsMap is keyed by
  // set_logos.set_code, which for a lazily-computed set (mtg/ygo, or a
  // Japanese set reusing its International counterpart's logo — see
  // lib/tcgSets.js computeLangSets) never matches setRef.set_id exactly, so
  // `info` above is null even though Explore already resolved a real logo
  // for this tile. setRef.logo_url carries that resolved logo through
  // instead of silently dropping it here.
  const logoUrl = setRef.logo_url || info?.logo_url || null;
  const gridReveal = useReveal();
  const constellationReveal = useReveal();
  const previewDrag = useDragScroll();
  const constellationDrag = useDragScroll();

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
      // physical card, linked by a shared canonical_card_id (verified on
      // Supabase: e.g. Fossil/base3 has 2 rows per card_number, one per
      // source, same canonical_card_id — One Piece is unaffected, single
      // source). SearchView already collapses this via groupByCanonical for
      // search results; apply the same dedup here so a set page shows each
      // card once.
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
    if (!isAuthed || !supabaseReady || cards.length === 0) { setOwnedIds(null); return; }
    let cancelled = false;
    const ids = cards.map(c => c.id);
    supabase.from("collection").select("card_api_id").in("card_api_id", ids)
      .then(({ data }) => { if (!cancelled) setOwnedIds(new Set((data || []).map(r => r.card_api_id))); })
      .catch(() => { if (!cancelled) setOwnedIds(null); });
    return () => { cancelled = true; };
  }, [isAuthed, cards]);

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
          {/* SET → SERIES — real data (cards.series_name), shown only when the
              source actually populated it; never inferred or fabricated. */}
          {cards[0]?.series_name && ` · ${cards[0].series_name} series`}
        </span>
        <div className="set-detail-row">
          {logoUrl && (
            <img src={logoUrl} alt={setName} className="set-logo-img"
              onError={e => { e.currentTarget.style.display = "none"; }} />
          )}
          <div className="view-h" style={{ margin: 0 }}>
            <h2 className="view-t">{setName}</h2>
          </div>
          {/* Completion ring — only when the user is signed in and we have
              real ownership rows for this set's cards; never a fake 0%. */}
          {ownedIds && cards.length > 0 && (
            <div className="set-completion-ring" style={{ '--pct': `${(ownedIds.size / cards.length) * 100}%` }}>
              <div className="set-completion-ring-inner">
                <span className="set-completion-n">{ownedIds.size}<small>/{cards.length}</small></span>
                <span className="set-completion-k">Collected</span>
              </div>
            </div>
          )}
        </div>
        {cards.length > 0 && (
          <div className="set-preview-strip" ref={previewDrag.ref}
            onPointerDown={previewDrag.onPointerDown} onPointerMove={previewDrag.onPointerMove}
            onPointerUp={previewDrag.onPointerUp} onPointerLeave={previewDrag.onPointerLeave}
            onClickCapture={previewDrag.onClickCapture}>
            {cards.slice(0, 18).map(c => {
              const img = pickCardImage(c) || c.imgUrl || c.img;
              const owned = ownedIds?.has(c.id);
              return img ? <div className={`set-preview-card${owned ? " owned" : ""}`} key={c.id}><img src={img} alt="" loading="lazy" /></div> : null;
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
          card with its same-set network gathered alongside it in a rail:
          structured (a featured card + related cards), not a random
          circular arrangement and not a second copy of the "All cards"
          grid above. Same-set is the one relationship this page's data
          actually supports — labeled honestly via the edge-label, nothing
          fabricated. A rail is inherently the same interaction on mobile
          as desktop (native horizontal scroll), so no separate fallback
          composition is needed. */}
      {cards.length > 3 && (() => {
        const protagonist = cards[0];
        const satellites = cards.slice(1, 13);
        return (
          <div ref={constellationReveal.ref} className={constellationReveal.className} style={constellationReveal.style}>
            <div className="sec-h sec-h-editorial" style={{ marginTop: 40 }}>
              <span className="sec-h-t">The constellation</span>
              <span className="sec-h-line" />
              <span className="edge-label" style={{ margin: 0 }}>SET → CARD</span>
            </div>
            <div className="constellation-rail" ref={constellationDrag.ref}
              onPointerDown={constellationDrag.onPointerDown} onPointerMove={constellationDrag.onPointerMove}
              onPointerUp={constellationDrag.onPointerUp} onPointerLeave={constellationDrag.onPointerLeave}
              onClickCapture={constellationDrag.onClickCapture}>
              <button type="button" className="constellation-protagonist" onClick={() => onOpen?.(protagonist)} title={protagonist.name}>
                <CardObject card={protagonist} variant="hero" owned={!!ownedIds?.has(protagonist.id)} fallback={null} />
              </button>
              {satellites.map(c => {
                const img = pickCardImage(c) || c.imgUrl || c.img;
                const owned = ownedIds?.has(c.id);
                return (
                  <button type="button" key={c.id} className={`constellation-satellite${owned ? " owned" : ""}`} onClick={() => onOpen?.(c)} title={c.name}>
                    {img ? <img src={img} alt="" loading="lazy" /> : <span className="constellation-node-ph" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </section>
  );
}
