import { useState, useEffect, useCallback } from "react";
import { supabase, supabaseReady, addToWatchlist } from "../../supabase.js";
import { TCG_LIST, CARD_LANGS, ebayURL, ebayItemURL } from "../../DraGold.jsx";
import { pickCardImage, getSetInfo } from "../shared/cardImage.js";
import { PortfolioModal } from "../shared/PortfolioModal.jsx";
import { AlertModal } from "../shared/AlertModal.jsx";
import { toApiId } from "../../lib/cardId.js";
import { PriceChart } from "./PriceChart.jsx";
import { Sparkline } from "./Sparkline.jsx";

export function AssetView({ card, onBack, isAuthed, onLogin, country, cur, eurRate, setsMap }) {
  const [snaps, setSnaps] = useState([]);       // [{price_market, source, captured_at}] asc
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [priceErr, setPriceErr] = useState(false);
  const [ebayItems, setEbayItems] = useState([]);
  const [imgFailed, setImgFailed] = useState(false);
  const [modal, setModal] = useState(null);     // 'portfolio' | 'alert' | null
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [toast, setToast] = useState("");
  // eBay sold timeframes (Finding API) — {'7d': {avg, median, count, currency}, ...}
  const [soldData, setSoldData] = useState({});
  // User plan tier: 'free' | 'collector' | 'pro'
  const [userTier, setUserTier] = useState('free');

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

  /* Load user tier from profiles when authenticated */
  useEffect(() => {
    if (!isAuthed || !supabaseReady) return;
    supabase.from("profiles").select("tier").single().then(({ data }) => {
      if (data?.tier) setUserTier(data.tier.toLowerCase());
    });
  }, [isAuthed]);

  useEffect(() => { loadPrice(); loadEbay(); loadSoldData(); }, [loadPrice, loadEbay, loadSoldData]);

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

  const gateAuth = (m) => { if (!isAuthed) { onLogin?.(); } else { setModal(m); } };

  const ebayHref = ebayURL(card.name, card.set_name || "", country, card.tcg || "pokemon", cardNum);

  return (
    <section className="view asset">
      <button className="back-btn" onClick={onBack}>
        <span style={{ transform: "rotate(180deg)", display: "flex" }}><Icon name="chevron" size={18} /></span>
        Back
      </button>

      <div className="asset-head">
        <div className="asset-img">
          {imgUrl && !imgFailed ? (
            <img src={imgUrl} alt={card.name} onError={() => setImgFailed(true)} />
          ) : (
            <div className="card-img-ph">
              {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.short}</span>}
              <span className="card-img-ph-init">{(card.name || "?").replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"}</span>
            </div>
          )}
        </div>
        <div className="asset-info">
          {tcgInfo && <span className="asset-tcg" style={{ color: tcgInfo.color }}>{tcgInfo.label}</span>}
          <h1 className="asset-name">{card.name}</h1>
          {setInfo?.logo_url && <img src={setInfo.logo_url} alt={card.set_name || ''} className="set-logo-img" onError={e=>{e.currentTarget.style.display='none';}} />}
          <div className="asset-meta">
            {card.set_name && <span>{card.set_name}</span>}
            {cardNum && <span className="asset-num">#{cardNum}</span>}
            {langInfo && <span>{langInfo.flag} {langInfo.label}</span>}
          </div>

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
                <span className="fmv-tag">FMV</span>
              </div>
              <div className="fmv-sub">{latest.source || "market"} · updated {new Date(latest.captured_at).toLocaleDateString()}</div>
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
              <a className="btn btn-primary btn-block" href={ebayHref} target="_blank" rel="noreferrer">
                See price on eBay ↗
              </a>
              <button className="btn btn-ghost btn-block" onClick={track} disabled={watchBusy || watching}>
                {watching ? "Tracking ✓" : watchBusy ? "…" : "Track this card"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AZIONI */}
      <div className="asset-actions">
        <button className="btn btn-primary" onClick={() => gateAuth("portfolio")}>
          <Icon name="wallet" size={18} /> Add to portfolio
        </button>
        <button className="btn btn-ghost" onClick={() => gateAuth("alert")}>
          <Icon name="bell" size={18} /> Create alert
        </button>
      </div>

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

      {modal === "portfolio" && (
        <PortfolioModal card={card} cur={cur} onClose={() => setModal(null)}
          onDone={(m) => { setModal(null); flash(m); }} />
      )}
      {modal === "alert" && (
        <AlertModal card={card} cur={cur} country={country} fmvUSD={fmvUSD} eurRate={eurRate}
          onClose={() => setModal(null)} onDone={(m) => { setModal(null); flash(m); }} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}
