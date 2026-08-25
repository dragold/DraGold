import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseReady, addToWatchlist, addOrIncrementCollection, decrementOrRemoveCollection } from "../../supabase.js";
import { TCG_LIST, CARD_LANGS, ebayURL, ebayItemURL } from "../../DraGold.jsx";
import { pickCardImage, getSetInfo } from "../shared/cardImage.js";
import { Icon } from "../shared/Icon.jsx";
import { PortfolioModal } from "../shared/PortfolioModal.jsx";
import { AlertModal } from "../shared/AlertModal.jsx";
import { toApiId } from "../../lib/cardId.js";
import { PriceChart } from "./PriceChart.jsx";
import { Sparkline } from "./Sparkline.jsx";
import { SearchResultItem } from "../search/SearchResultItem.jsx";
import { CardObject } from "../shared/CardObject.jsx";
import { useDragScroll } from "../../lib/useDragScroll.js";

// Ordina card_number in modo "naturale" (5 prima di 12, non lessicografico):
// necessario perché nel DB i numeri non sono sempre zero-padded in modo uniforme
// tra set/lingue diverse. Usato solo per la rail "altre carte di questo set".
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

// Campi comuni per le query "carte correlate" qui sotto — stessa selezione usata
// nei risultati di ricerca, così SearchResultItem/getSetInfo/pickCardImage
// funzionano identici nelle rail di Card Detail.
const RELATED_CARD_FIELDS = "id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,canonical_card_id,card_image_cache(cached_url,status)";

// Mappa i valori tecnici della colonna card_prices.source verso label leggibili.
// Valori distinti verificati in DB (2026-08-11): ygoprodeck, scryfall, pokemontcgio,
// cardmarket, optcg, ebay_sold, justtcg. Fallback: humanize automatico per valori
// futuri non ancora mappati, così non torna mai una stringa tecnica grezza in UI.
const SOURCE_LABELS = {
  ygoprodeck: "YGOPRODeck",
  scryfall: "Scryfall",
  pokemontcgio: "Pokémon TCG API",
  cardmarket: "Cardmarket",
  optcg: "One Piece TCG",
  ebay_sold: "eBay (sold)",
  ebay_finding: "eBay (sold)",
  justtcg: "JustTCG",
};
function sourceLabel(source) {
  if (!source) return "market";
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function AssetView({ card, onBack, isAuthed, onLogin, country, cur, eurRate, setsMap, onOpenCard, onOpenSet }) {
  const variantsDrag = useDragScroll();
  const sameSetDrag = useDragScroll();
  const artistDrag = useDragScroll();
  const [snaps, setSnaps] = useState([]);       // [{price_market, source, captured_at}] asc
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceErr, setPriceErr] = useState(false);
  const [ebayItems, setEbayItems] = useState([]);
  const [modal, setModal] = useState(null);     // 'portfolio' | 'alert' | null
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [collected, setCollected] = useState(false);
  const [collectBusy, setCollectBusy] = useState(false);
  const [decrementBusy, setDecrementBusy] = useState(false);
  // Real quantity already in the user's portfolio for this card — fetched on
  // mount so the CTA reflects reality on first paint ("In Portfolio · X
  // copies"), not only after a click during this session (Portfolio 2.0,
  // FASE 1: "Add to Collection" and "Add to Portfolio" are the same action,
  // quantity must always be represented).
  const [myQty, setMyQty] = useState(0);
  const [toast, setToast] = useState("");
  // eBay sold timeframes (Finding API) — {'7d': {avg, median, count, currency}, ...}
  const [soldData, setSoldData] = useState({});
  // User plan tier: 'free' | 'collector' | 'pro'
  const [userTier, setUserTier] = useState('free');
  // Carte correlate: altre lingue/stampe della stessa carta (canonical_card_id) e
  // altre carte dello stesso set nella stessa lingua. Trasforma Card Detail da
  // pagina terminale a nodo esplorabile (vedi DraGold-Next-Evolution-Research.md).
  const [variants, setVariants] = useState([]);
  const [sameSetCards, setSameSetCards] = useState([]);
  // Fact-grid enrichment (rarity/illustrator/print variant): these columns
  // exist on `cards` but aren't part of the field lists the pages that can
  // open a card (search, hot picks, set grid, rails) select — fetching them
  // here, by primary key, is a single lightweight indexed lookup scoped to
  // this page only, no other query touched.
  const [cardExtra, setCardExtra] = useState(null);
  // "Related cards" (CARD → ARTIST) — the North Star's one relationship rail
  // not yet built: other cards by the same illustrator, an already-indexed
  // real column (cards_illustrator_idx), truthfully labeled by what it
  // actually is rather than a fuzzy "related" score we can't compute.
  const [artistCards, setArtistCards] = useState([]);
  const [zoomOpen, setZoomOpen] = useState(false);

  const tcgInfo = TCG_LIST.find(t => t.id === card.tcg);
  const langInfo = CARD_LANGS.find(l => l.c === card.lang);
  const setInfo = getSetInfo(card, setsMap);
  const imgUrl = pickCardImage(card) || card.imgUrl || card.img || null;
  const cardNum = card.card_number || "";

  const latest = snaps.length ? snaps[snaps.length - 1] : null;
  const fmvUSD = latest?.price_market ?? null;
  const priceStr = (usd) => usd == null ? "—"
    : cur === "EUR" ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  /* prezzi: tutti gli snapshot per card.id, ordine cronologico */
  const loadPrice = useCallback(async () => {
    setLoadingPrice(true); setPriceErr(false);
    try {
      if (!supabaseReady) throw new Error("no backend");
      const { data, error } = await supabase
        .from("card_prices")
        .select("price_market,source,captured_at")
        .eq("card_id", card.id)
        .order("captured_at", { ascending: true })
        .limit(60);
      if (error) throw error;
      setSnaps((data || []).filter(r => r.price_market != null));
    } catch {
      setPriceErr(true); setSnaps([]);
    } finally {
      setLoadingPrice(false);
    }
  }, [card.id]);

  // Numero carta "distintivo" = filtrabile in modo affidabile su eBay (es. OP12-079,
  // 006/165, swsh1-1). Un numero corto puro come "5" o "199" matcha qualunque titolo
  // ("DP5", "...199...") → falsi positivi: in quel caso NON mostriamo eBay Live. (Fix #3)
  const numNorm = cardNum.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const numDistinctive = !!cardNum && (
    /[a-z]/i.test(cardNum) || /[-/]/.test(cardNum) || numNorm.length >= 5
  );

  /* eBay live: solo listing col numero carta (distintivo) nel titolo, max 5 (Fix #3) */
  const loadEbay = useCallback(async () => {
    if (!numDistinctive) { setEbayItems([]); return; }
    try {
      const market = EBAY_MARKETS.includes(country) ? country : "US";
      const suffix = card.tcg === "mtg" ? "magic the gathering"
        : card.tcg === "ygo" ? "yugioh"
        : card.tcg === "onepiece" ? "one piece card" : "pokemon card";
      const q = `${card.name} ${cardNum} ${suffix}`.replace(/\s+/g, " ").trim();
      const r = await fetch(`/api/ebay-search?q=${encodeURIComponent(q)}&market=${market}&limit=20`, {
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
      if (!r || !r.ok) { setEbayItems([]); return; }
      const d = await r.json();
      const matches = (d.items || [])
        .filter(it => (it.title || "").replace(/[^a-z0-9]/gi, "").toLowerCase().includes(numNorm))
        .slice(0, 5);
      setEbayItems(matches);
    } catch {
      setEbayItems([]);
    }
  }, [card.id, cardNum, numNorm, numDistinctive, country]);

  /* eBay sold timeframes: fetch latest row per timeframe from card_prices (source=ebay_finding) */
  const loadSoldData = useCallback(async () => {
    if (!supabaseReady) return;
    try {
      const { data } = await supabase
        .from("card_prices")
        .select("price_market,price_median,timeframe,currency,captured_at,raw_response")
        .eq("card_id", card.id)
        .eq("source", "ebay_finding")
        .not("timeframe", "is", null)
        .order("captured_at", { ascending: false })
        .limit(30);
      // Keep only the newest row per timeframe; extract count from raw_response
      const byTf = {};
      for (const row of (data || [])) {
        if (!byTf[row.timeframe]) {
          byTf[row.timeframe] = { ...row, count: row.raw_response?.count ?? null };
        }
      }
      setSoldData(byTf);
    } catch { /* best-effort */ }
  }, [card.id]);

  /* Carte correlate: SOLO via canonical_card_id (mai similarità di nome — vedi
     lib/search.js) per le altre versioni, e tcg+set_id+lang per "altre carte del
     set". Entrambe le chiavi sono dati già esistenti in DB, nessuna nuova colonna. */
  const loadRelated = useCallback(async () => {
    if (!supabaseReady) { setVariants([]); setSameSetCards([]); return; }
    try {
      const [variantsRes, sameSetRes] = await Promise.all([
        card.canonical_card_id
          ? supabase.from("cards").select(RELATED_CARD_FIELDS)
              .eq("canonical_card_id", card.canonical_card_id)
              .neq("id", card.id)
              .limit(20)
          : Promise.resolve({ data: [] }),
        card.set_id
          ? supabase.from("cards").select(RELATED_CARD_FIELDS)
              .eq("tcg", card.tcg).eq("set_id", card.set_id).eq("lang", card.lang)
              .neq("id", card.id)
              .limit(12)
          : Promise.resolve({ data: [] }),
      ]);
      setVariants(variantsRes.data || []);
      const sameSet = (sameSetRes.data || []).slice()
        .sort((a, b) => naturalCompare(a.card_number, b.card_number));
      setSameSetCards(sameSet);
    } catch {
      setVariants([]); setSameSetCards([]);
    }
  }, [card.id, card.canonical_card_id, card.set_id, card.tcg, card.lang]);

  /* Load user tier from profiles when authenticated */
  useEffect(() => {
    if (!isAuthed || !supabaseReady) return;
    supabase.from("profiles").select("tier").single().then(({ data }) => {
      if (data?.tier) setUserTier(data.tier.toLowerCase());
    });
  }, [isAuthed]);

  /* Real portfolio quantity for this card — RLS scopes to auth.uid() automatically
     (same pattern as listCollection()/SetDetailPage), so no explicit user filter. */
  useEffect(() => {
    if (!isAuthed || !supabaseReady) { setMyQty(0); return; }
    let cancelled = false;
    supabase.from("collection").select("quantity").eq("card_api_id", toApiId(card)).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyQty(data?.quantity || 0); })
      .catch(() => { if (!cancelled) setMyQty(0); });
    return () => { cancelled = true; };
  }, [isAuthed, card.id]);

  useEffect(() => { loadPrice(); loadEbay(); loadSoldData(); loadRelated(); }, [loadPrice, loadEbay, loadSoldData, loadRelated]);

  // Artwork zoom lightbox — Esc to close. No focus-trap dependency: a
  // single full-bleed image with one dismiss action doesn't need one, and
  // the North Star's own implementation notes call a focus-trap lib merely
  // a "candidate", not a requirement.
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setZoomOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  useEffect(() => {
    if (!supabaseReady) { setCardExtra(null); return; }
    let cancelled = false;
    supabase.from("cards").select("rarity,illustrator,print_variant,supertype").eq("id", card.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setCardExtra(data || null); })
      .catch(() => { if (!cancelled) setCardExtra(null); });
    return () => { cancelled = true; };
  }, [card.id]);

  useEffect(() => {
    if (!supabaseReady || !cardExtra?.illustrator) { setArtistCards([]); return; }
    let cancelled = false;
    supabase.from("cards").select(RELATED_CARD_FIELDS)
      .eq("tcg", card.tcg).eq("lang", card.lang).eq("illustrator", cardExtra.illustrator)
      .neq("id", card.id)
      .limit(12)
      .then(({ data }) => { if (!cancelled) setArtistCards(data || []); })
      .catch(() => { if (!cancelled) setArtistCards([]); });
    return () => { cancelled = true; };
  }, [card.id, card.tcg, card.lang, cardExtra?.illustrator]);

  // Language pills: distinct languages available for this canonical card
  // (from the variants rail's own data — no extra query), current language
  // first, each entry pointing at one concrete row in that language.
  const langPills = (() => {
    const byLang = new Map();
    byLang.set(card.lang, card);
    for (const v of variants) if (!byLang.has(v.lang)) byLang.set(v.lang, v);
    return [...byLang.entries()].map(([lang, c]) => ({
      lang, card: c, info: CARD_LANGS.find(l => l.c === lang),
    }));
  })();

  /* Price formatting for sold rows (may be EUR from EBAY-IT or USD from EBAY-US) */
  const fmtSold = (val, currency) => {
    if (val == null) return "—";
    if (currency === 'EUR') {
      return cur === 'EUR' ? `€${val.toFixed(2)}` : `$${(val / eurRate).toFixed(2)}`;
    }
    return priceStr(val); // USD → priceStr handles EUR conversion
  };

  /* Tier gate: Collector and Pro see 7d + 90d data */
  const isPaid = isAuthed && (userTier === 'collector' || userTier === 'pro');

  const track = async () => {
    if (!isAuthed) { onLogin?.(); return; }
    if (watchBusy || watching) return;
    setWatchBusy(true);
    const res = await addToWatchlist({
      tcg: card.tcg, cardApiId: toApiId(card), cardName: card.name,
      setName: card.set_name || "", imageUrl: imgUrl,
    });
    setWatchBusy(false);
    if (res?.error) { flash(typeof res.error === "string" ? res.error : "Could not track."); return; }
    setWatching(true);
    flash("Tracking — we'll price it on the next refresh");
  };

  // Aggiungi alla collezione — core loop di PRODUCT_SPEC §4 (Collection come layer
  // di engagement/progresso, non più solo portfolio finanziario). Block Quantity
  // (18/08/2026): usa la RPC atomica add_or_increment_collection invece del vecchio
  // upsert semplice, cosi' un secondo click sulla stessa carta incrementa quantity
  // in modo sicuro (nessuna race SELECT->+1 lato client) invece di essere un no-op.
  // Il bottone resta cliccabile anche dopo il primo add (non piu' "disabled":
  // cliccare di nuovo e' un'azione valida = "ho un'altra copia"), il feedback
  // distingue esplicitamente prima copia vs copia aggiuntiva cosi' un click per
  // sbaglio non sembra un "Added" fasullo su una carta gia' in collezione.
  const addCollection = async () => {
    if (!isAuthed) { onLogin?.(); return; }
    if (collectBusy) return;
    setCollectBusy(true);
    const res = await addOrIncrementCollection({
      card_api_id: toApiId(card), tcg: card.tcg, card_name: card.name,
      set_name: card.set_name || "", image_url: imgUrl,
      card_number: card.card_number || null, rarity: card.rarity || null,
      language: card.lang || null,
    });
    setCollectBusy(false);
    if (res?.error) { flash(typeof res.error === "string" ? res.error : "Could not add to portfolio."); return; }
    setCollected(true);
    const row = res?.data;
    if (row?.quantity != null) setMyQty(row.quantity);
    if (row?.out_inserted) {
      flash("Added to your portfolio");
    } else {
      flash(`Another copy added — you now have ${row?.quantity ?? "multiple"}`);
    }
  };

  // Rimuovi una copia — gemella simmetrica di addCollection, stessa RPC
  // pattern (decrement_or_remove_collection): atomica, nessuna race. A
  // quantity 1 la riga viene eliminata (myQty torna 0, CTA torna "Add to
  // Portfolio"); a quantity>1 decrementa e basta.
  const decrementCollection = async () => {
    if (!isAuthed) { onLogin?.(); return; }
    if (decrementBusy || myQty <= 0) return;
    setDecrementBusy(true);
    const res = await decrementOrRemoveCollection(toApiId(card));
    setDecrementBusy(false);
    if (res?.error) { flash(typeof res.error === "string" ? res.error : "Could not remove copy."); return; }
    const row = res?.data;
    if (!row) { flash("Could not remove copy."); return; }
    setMyQty(row.quantity);
    if (row.out_deleted) {
      setCollected(false);
      flash("Removed from your portfolio");
    } else {
      flash(`Copy removed — you now have ${row.quantity}`);
    }
  };

  const gateAuth = (m) => { if (!isAuthed) { onLogin?.(); } else { setModal(m); } };

  const ebayHref = ebayURL(card.name, card.set_name || "", country, card.tcg || "pokemon", cardNum);

  // Market/Purchase Discovery MVP (2026-08-25): quando la carta non ha un
  // prezzo interno affidabile (fmvUSD == null, vedi blocco "PREZZO" sotto),
  // invece di inventare un valore mostriamo dove l'utente può verificare/
  // comprare la carta. eBay resta oggi l'unica integrazione reale con
  // affiliate tracking effettivamente configurato (EBAY_CAMP/mkrid, vedi
  // ebayURL in DraGold.jsx) — PRODUCT_SPEC.md §5: "eBay, se usato, resta un
  // link/CTA esterno onesto, non una fonte su cui costruire logica di
  // prodotto". Array (non un singolo link cablato) apposta per poter
  // aggiungere in futuro TCGplayer/Cardmarket senza rifare questo blocco:
  // richiedono una loro registrazione/approvazione affiliate separata, non
  // ancora fatta — non inventata qui, vedi report del task per il dettaglio.
  const marketLinks = [
    { key: "ebay", label: "Find listings on eBay", href: ebayHref },
  ].filter(l => l.href);

  return (
    <section className="view asset">
      <button className="back-btn" onClick={onBack}>
        <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={18} /></span>
        Back
      </button>

      <div className="asset-breadcrumb">
        <span>{tcgInfo?.label || "Catalog"}</span>
        {langInfo && <><span>·</span><span>{langInfo.label}</span></>}
        {card.set_name && <><span>·</span><span>{card.set_name}</span></>}
        <span>·</span><b>{card.name}</b>
      </div>

      <div className="asset-head">
        <div className="asset-img-col">
          <div className="asset-img">
            <CardObject
              card={card}
              src={imgUrl}
              alt={card.name}
              variant="hero"
              fallback={
                <div className="card-img-ph">
                  {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
                  <span className="card-img-ph-init">{(card.name || "?").replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"}</span>
                </div>
              }
            />
          </div>
          {imgUrl && (
            <div className="asset-img-caption-row">
              <span className="asset-img-caption">Tilt to inspect</span>
              <span className="asset-img-caption-sep">·</span>
              <button type="button" className="asset-img-caption-action" onClick={() => setZoomOpen(true)}>Zoom artwork</button>
            </div>
          )}
        </div>
        <div className="asset-info">
          {tcgInfo && <span className="asset-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.label}</span>}
          <h1 className="asset-name">{card.name}</h1>

          {langPills.length > 1 && (
            <div className="asset-lang-pills">
              {langPills.map(p => (
                <button type="button" key={p.lang}
                  className={`asset-lang-pill${p.lang === card.lang ? " on" : ""}`}
                  onClick={() => p.lang !== card.lang && onOpenCard?.(p.card)}>
                  {p.info?.label || p.lang.toUpperCase()}
                  {p.lang === card.lang && <span className="asset-lang-pill-dot" />}
                </button>
              ))}
            </div>
          )}

          {(() => {
            const canOpenSet = !!(onOpenSet && card.set_id);
            // Explorer/Set-Experience completeness (2026-08-25): setInfo.logo_url
            // is already resolved above (getSetInfo) and used to render this very
            // logo a few lines below — it just wasn't threaded into the ref passed
            // to onOpenSet, so Set Detail had to re-resolve it from its own
            // (eager, International-only) setsMap cache and silently lost the logo
            // for any set only resolved lazily (e.g. Japanese sets) when reached
            // via Card Detail's "view set" link. Same fix already applied to
            // Explore's SetTile in the earlier Explorer/Catalog Completeness task.
            const openThisSet = () => onOpenSet({ tcg: card.tcg, set_id: card.set_id, lang: card.lang, set_name: setInfo?.set_name || card.set_name, logo_url: setInfo?.logo_url || null });
            return (
              <>
                {setInfo?.logo_url && (
                  canOpenSet ? (
                    <button type="button" className="set-logo-link" onClick={openThisSet} aria-label={`Browse ${setInfo?.set_name || card.set_name || 'this set'}`}>
                      <img src={setInfo.logo_url} alt={card.set_name || ''} className="set-logo-img" onError={e=>{e.currentTarget.style.display='none';}} />
                    </button>
                  ) : (
                    <img src={setInfo.logo_url} alt={card.set_name || ''} className="set-logo-img" onError={e=>{e.currentTarget.style.display='none';}} />
                  )
                )}
                <div className="asset-fact-grid">
                  {card.set_name && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Set</span>
                      <span className="asset-fact-v">
                        {canOpenSet ? (
                          <button type="button" className="asset-meta-link" onClick={openThisSet}>
                            {card.set_name}<Icon name="chevron" size={11} stroke={2.5} />
                          </button>
                        ) : card.set_name}
                      </span>
                    </div>
                  )}
                  {cardNum && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Number</span>
                      <span className="asset-fact-v asset-fact-mono">#{cardNum}</span>
                    </div>
                  )}
                  {langInfo && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Language</span>
                      <span className="asset-fact-v">{langInfo.flag} {langInfo.label}</span>
                    </div>
                  )}
                  {cardExtra?.rarity && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Rarity</span>
                      <span className="asset-fact-v">{cardExtra.rarity}</span>
                    </div>
                  )}
                  {cardExtra?.illustrator && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Illustrator</span>
                      <span className="asset-fact-v">{cardExtra.illustrator}</span>
                    </div>
                  )}
                  {cardExtra?.print_variant && (
                    <div className="asset-fact">
                      <span className="asset-fact-k">Print</span>
                      <span className="asset-fact-v">{cardExtra.print_variant}</span>
                    </div>
                  )}
                </div>
                {/* Academy (Task 4, FASE 5) — one simple, generic link, not
                    card-specific data: rarity/variant is the fact this page
                    is most likely to raise a "what does that mean?" for. */}
                <a className="asset-academy-link" href="/academy/rarity-variants">
                  <Icon name="doc" size={14} /> Learn about rarity &amp; variants
                </a>
              </>
            );
          })()}

          {/* PREZZO */}
          {loadingPrice ? (
            <div className="price-skel" />
          ) : priceErr ? (
            <div className="search-error" style={{ margin: "14px 0" }}>
              <span>Couldn't load the price.</span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={loadPrice}>Retry</button>
            </div>
          ) : fmvUSD != null ? (
            <div className="fmv-block">
              <div className="fmv-row">
                <span className="fmv-val">{priceStr(fmvUSD)}</span>
              </div>
              <div className="fmv-sub">{sourceLabel(latest.source)} · updated {new Date(latest.captured_at).toLocaleDateString()}</div>
              {snaps.length >= 2 && (
                <div className="spark-wrap">
                  <Sparkline
                    values={snaps.map(s => s.price_market)}
                    gain={snaps[snaps.length - 1].price_market >= snaps[0].price_market}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="noprice-block">
              <div className="noprice-txt">No market price yet for this card.</div>
              {marketLinks.map(l => (
                <a key={l.key} className="btn btn-primary btn-block" href={l.href} target="_blank" rel="noreferrer">
                  {l.label} ↗
                </a>
              ))}
              <button className="btn btn-ghost btn-block" onClick={track} disabled={watchBusy || watching}>
                {watching ? "Tracking ✓" : watchBusy ? "…" : "Track this card"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AZIONI — "Add to Collection" e "Add to Portfolio" sono la stessa azione
          (Portfolio 2.0, FASE 1): un solo CTA primario che usa il sistema di
          quantità esistente (RPC add_or_increment_collection), più un'azione
          secondaria per registrare prezzo pagato/condizione sulla stessa riga. */}
      <div className="asset-actions">
        {myQty > 0 ? (
          <div className="pf-status-row">
            <span className="pf-status-badge">
              <Icon name="wallet" size={14} /> In Portfolio · {myQty} {myQty === 1 ? "copy" : "copies"}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={addCollection} disabled={collectBusy}>
              {collectBusy ? "…" : "+ Add another"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={decrementCollection} disabled={decrementBusy}
              aria-label="Remove one copy from portfolio">
              {decrementBusy ? "…" : "− Remove one"}
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={addCollection} disabled={collectBusy}>
            <Icon name="wallet" size={18} /> {collectBusy ? "…" : "+ Add to Portfolio"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => gateAuth("portfolio")}>
          <Icon name="doc" size={16} /> {myQty > 0 ? "Edit price & condition" : "Set purchase price"}
        </button>
        <button className="btn btn-ghost" onClick={() => gateAuth("alert")}>
          <Icon name="bell" size={18} /> Create alert
        </button>
      </div>

      {/* ALTRE VERSIONI — stessa carta, raggruppate SOLO via canonical_card_id */}
      {variants.length > 0 && (
        <div className="rel-rail-section">
          <span className="edge-label">CARD → LANGUAGE / PRINT</span>
          <div className="sec-h"><span className="sec-h-t">Other versions of this card</span><span className="sec-h-line" /></div>
          <div className="rel-rail" ref={variantsDrag.ref}
            onPointerDown={variantsDrag.onPointerDown} onPointerMove={variantsDrag.onPointerMove}
            onPointerUp={variantsDrag.onPointerUp} onPointerLeave={variantsDrag.onPointerLeave}
            onClickCapture={variantsDrag.onClickCapture}>
            {variants.map(v => (
              <div className="rel-rail-item" key={v.id}>
                <SearchResultItem card={v} priceInfo={null} country={country} cur={cur} eurRate={eurRate}
                  onOpen={onOpenCard} setsMap={setsMap} discoveryMode />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRICE HISTORY CHART */}
      {snaps.length >= 3 && (
        <PriceChart snaps={snaps} priceStr={priceStr} />
      )}

      {/* eBay SOLD TIMEFRAMES — dati da Finding API (7d/30d/90d) */}
      {(soldData['7d'] || soldData['30d'] || soldData['90d']) && (
        <div className="sold-section">
          <div className="sec-h">
            <span className="sec-h-t">eBay sold · avg price</span>
            <span className="sec-h-line" />
          </div>
          <div className="sold-table">
            {/* Header */}
            <div className="sold-hdr">
              <span>Window</span><span>Avg</span><span>Median</span><span>Sales</span>
            </div>
            {/* 7d — Collector/Pro only */}
            {isPaid ? (
              soldData['7d'] ? (
                <div className="sold-row">
                  <span className="sold-label">7 days</span>
                  <span className="sold-avg">{fmtSold(soldData['7d'].price_market, soldData['7d'].currency)}</span>
                  <span className="sold-med">{fmtSold(soldData['7d'].price_median, soldData['7d'].currency)}</span>
                  <span className="sold-n">{soldData['7d'].count ?? '—'}</span>
                </div>
              ) : (
                <div className="sold-row sold-empty">
                  <span className="sold-label">7 days</span>
                  <span className="sold-avg muted">—</span>
                  <span className="sold-med muted">—</span>
                  <span className="sold-n muted">0</span>
                </div>
              )
            ) : (
              <div className="sold-row sold-locked" onClick={() => !isAuthed && onLogin?.()}>
                <span className="sold-label">7 days</span>
                <span className="sold-gate">🔒 Collector+</span>
              </div>
            )}
            {/* 30d — free for everyone */}
            {soldData['30d'] && (
              <div className="sold-row sold-featured">
                <span className="sold-label">30 days</span>
                <span className="sold-avg">{fmtSold(soldData['30d'].price_market, soldData['30d'].currency)}</span>
                <span className="sold-med">{fmtSold(soldData['30d'].price_median, soldData['30d'].currency)}</span>
                <span className="sold-n">{soldData['30d'].count ?? '—'}</span>
              </div>
            )}
            {/* 90d — Collector/Pro only */}
            {isPaid ? (
              soldData['90d'] ? (
                <div className="sold-row">
                  <span className="sold-label">90 days</span>
                  <span className="sold-avg">{fmtSold(soldData['90d'].price_market, soldData['90d'].currency)}</span>
                  <span className="sold-med">{fmtSold(soldData['90d'].price_median, soldData['90d'].currency)}</span>
                  <span className="sold-n">{soldData['90d'].count ?? '—'}</span>
                </div>
              ) : (
                <div className="sold-row sold-empty">
                  <span className="sold-label">90 days</span>
                  <span className="sold-avg muted">—</span>
                  <span className="sold-med muted">—</span>
                  <span className="sold-n muted">0</span>
                </div>
              )
            ) : (
              <div className="sold-row sold-locked" onClick={() => !isAuthed && onLogin?.()}>
                <span className="sold-label">90 days</span>
                <span className="sold-gate">🔒 Collector+</span>
              </div>
            )}
          </div>
          {!isPaid && (
            <div className="sold-upgrade">
              Upgrade to Collector for 7-day &amp; 90-day sold data
            </div>
          )}
        </div>
      )}

      {/* eBAY LIVE — nascosta se zero match */}
      {ebayItems.length > 0 && (
        <div className="ebay-live">
          <div className="sec-h">
            <span className="sec-h-t">eBay live · {cardNum}</span>
            <span className="sec-h-line" />
          </div>
          <div className="ebay-list">
            {ebayItems.map((it, i) => (
              <a key={i} className="ebay-row" href={ebayItemURL(it.url, country)} target="_blank" rel="noreferrer">
                <div className="ebay-thumb">
                  {it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : <Icon name="card" size={18} />}
                </div>
                <div className="ebay-body">
                  <div className="ebay-title">{it.title}</div>
                  {it.condition && <div className="ebay-cond">{it.condition}</div>}
                </div>
                <div className="ebay-price">
                  {it.currency === "EUR" ? "€" : it.currency === "GBP" ? "£" : "$"}{Number(it.price).toFixed(2)}
                </div>
              </a>
            ))}
          </div>
          <a className="ebay-all" href={ebayHref} target="_blank" rel="noreferrer">See all on eBay ↗</a>
        </div>
      )}

      {/* ALTRE CARTE DEL SET — stesso tcg+set_id+lang, escludendo la carta corrente */}
      {sameSetCards.length > 0 && (
        <div className="rel-rail-section">
          <span className="edge-label">CARD → SET</span>
          <div className="sec-h">
            <span className="sec-h-t">More from {card.set_name || setInfo?.set_name || "this set"}</span>
            <span className="sec-h-line" />
            {onOpenSet && card.set_id && (
              <button type="button" className="rail-more-link"
                onClick={() => onOpenSet({ tcg: card.tcg, set_id: card.set_id, lang: card.lang, set_name: setInfo?.set_name || card.set_name, logo_url: setInfo?.logo_url || null })}>
                See full set <Icon name="chevron" size={11} stroke={2.5} />
              </button>
            )}
          </div>
          <div className="rel-rail" ref={sameSetDrag.ref}
            onPointerDown={sameSetDrag.onPointerDown} onPointerMove={sameSetDrag.onPointerMove}
            onPointerUp={sameSetDrag.onPointerUp} onPointerLeave={sameSetDrag.onPointerLeave}
            onClickCapture={sameSetDrag.onClickCapture}>
            {sameSetCards.map(c => (
              <div className="rel-rail-item" key={c.id}>
                <SearchResultItem card={c} priceInfo={null} country={country} cur={cur} eurRate={eurRate}
                  onOpen={onOpenCard} setsMap={setsMap} discoveryMode />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CARTE CORRELATE PER ILLUSTRATORE — stesso tcg+lang+illustrator */}
      {artistCards.length > 0 && (
        <div className="rel-rail-section">
          <span className="edge-label">CARD → ARTIST</span>
          <div className="sec-h">
            <span className="sec-h-t">More by {cardExtra.illustrator}</span>
            <span className="sec-h-line" />
          </div>
          <div className="rel-rail" ref={artistDrag.ref}
            onPointerDown={artistDrag.onPointerDown} onPointerMove={artistDrag.onPointerMove}
            onPointerUp={artistDrag.onPointerUp} onPointerLeave={artistDrag.onPointerLeave}
            onClickCapture={artistDrag.onClickCapture}>
            {artistCards.map(c => (
              <div className="rel-rail-item" key={c.id}>
                <SearchResultItem card={c} priceInfo={null} country={country} cur={cur} eurRate={eurRate}
                  onOpen={onOpenCard} setsMap={setsMap} discoveryMode />
              </div>
            ))}
          </div>
        </div>
      )}

      {modal === "portfolio" && (
        <PortfolioModal card={card} cur={cur} onClose={() => setModal(null)}
          onDone={(m) => { setModal(null); flash(m); }} />
      )}
      {modal === "alert" && (
        <AlertModal card={card} cur={cur} country={country} fmvUSD={fmvUSD} eurRate={eurRate}
          onClose={() => setModal(null)} onDone={(m) => { setModal(null); flash(m); }} />
      )}

      {toast && <div className="toast">{toast}</div>}

      {zoomOpen && imgUrl && (
        <div className="artwork-lightbox" onClick={() => setZoomOpen(false)}>
          <button type="button" className="artwork-lightbox-close" onClick={() => setZoomOpen(false)} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
          <img src={card.image_url_hi || imgUrl} alt={card.name} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
