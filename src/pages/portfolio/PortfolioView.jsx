// DraGold — Portfolio (estratto da DraGold.jsx, CLAUDE.md §5 modularizzazione).
// Logica invariata: stessa UI, stessi dati, stesse chiamate. Solo spostamento di file.
import { useState, useEffect, useCallback } from "react";
import { supabase, listCollection, removeFromCollection, addToWatchlist } from "../../supabase.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import { TCG_LIST, Empty } from "../../DraGold.jsx";

/* ─── PortfolioRow — separato per rispettare la regola degli hooks ─── */
function PortfolioRow({ pos, priceInfo, cur, eurRate, fmt, isConfirm, onConfirm, onCancelConfirm, onRemove, onTrack, trackBusy, trackDone, removeBusy }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(pos) || null;
  const initials = (pos.card_name || "")
    .replace(/[^a-zA-Z ]/g, "").trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const tcgInfo = TCG_LIST.find(t => t.id === pos.tcg);

  const capturedAt = priceInfo?.captured_at ? new Date(priceInfo.captured_at) : null;
  const ageMs = capturedAt ? (Date.now() - capturedAt.getTime()) : null;
  const freshClass = ageMs == null ? null : ageMs < 24*3600*1000 ? "ok" : ageMs < 14*24*3600*1000 ? "warn" : "stale";
  const freshLabel = ageMs == null ? null : ageMs < 3600*1000 ? `${Math.max(1, Math.round(ageMs/60000))}m ago` : ageMs < 24*3600*1000 ? `${Math.round(ageMs/3600000)}h ago` : `${Math.round(ageMs/86400000)}d ago`;

  const currentUSD = priceInfo?.price_market ?? null;
  const paidRaw    = pos.purchase_price;
  const fmvCur     = pos.fmv_currency || cur;
  // purchase_price is stored in the currency the user had active (fmv_currency)
  const paidUSD    = paidRaw != null
    ? (fmvCur === "EUR" ? paidRaw / eurRate : Number(paidRaw))
    : null;
  const rowPnlUSD  = (currentUSD != null && paidUSD != null) ? currentUSD - paidUSD : null;
  const rowPnlPos  = rowPnlUSD != null ? rowPnlUSD >= 0 : null;

  const paidDisplay = paidRaw != null
    ? (fmvCur === "EUR" ? `€${Number(paidRaw).toFixed(2)}` : `$${Number(paidRaw).toFixed(2)}`)
    : "—";

  return (
    <div className="pf-row">
      {/* Thumbnail */}
      <div className="pf-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={pos.card_name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width:"100%", height:"100%" }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color:tcgInfo.color, fontSize:8 }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init" style={{ fontSize:13 }}>{initials}</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="pf-body">
        <div className="pf-name">{pos.card_name || "—"}{pos.quantity > 1 && <span style={{ opacity: 0.6, fontWeight: 400 }}> ×{pos.quantity}</span>}</div>
        <div className="pf-meta">
          {pos.condition && <span className="pf-cond">{pos.condition}</span>}
          {pos.set_name  && <span className="pf-set">{pos.set_name}</span>}
          {pos.lang && <span className="pf-lang">{String(pos.lang).toUpperCase()}</span>}
          {freshLabel && <span className={`pf-fresh ${freshClass}`}>{freshLabel}</span>}
        </div>
        <div className="pf-prices">
          <div className="pf-price-col">
            <span className="pf-price-lbl">Paid</span>
            <span className="pf-price-val">{paidDisplay}</span>
          </div>
          <div className="pf-price-col">
            <span className="pf-price-lbl">Now</span>
            <span className="pf-price-val">{currentUSD != null ? fmt(currentUSD) : "—"}</span>
          </div>
          <div className="pf-price-col">
            <span className="pf-price-lbl">P&amp;L</span>
            <span className={`pf-price-val${rowPnlPos === true ? " gain" : rowPnlPos === false ? " loss" : ""}`}>
              {rowPnlUSD != null ? `${rowPnlPos ? "+" : ""}${fmt(rowPnlUSD)}` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pf-actions">
        {currentUSD == null && (
          <button className="btn btn-ghost btn-sm pf-track-btn"
            disabled={trackBusy || trackDone} onClick={onTrack}>
            {trackDone ? "✓" : trackBusy ? "…" : "Track"}
          </button>
        )}
        {!isConfirm ? (
          <button className="pf-remove-btn" onClick={onConfirm} aria-label="Remove position">
            <Icon name="close" size={14} />
          </button>
        ) : (
          <div className="pf-confirm">
            <span className="pf-confirm-txt">Remove?</span>
            <button className="btn btn-ghost btn-sm" onClick={onCancelConfirm}>Cancel</button>
            <button className="btn btn-sm pf-confirm-yes" disabled={removeBusy} onClick={onRemove}>
              {removeBusy ? "…" : "Yes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Portfolio Value Chart SVG ─── */
function PortfolioChart({ points, fmt }) {
  if (!points || points.length < 2) return null;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 360, H = 100, PT = 8, PB = 24, PL = 56, PR = 8;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length-1).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' Z';
  const xLabelIdxs = points.length <= 4 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <div className="pf-chart-wrap">
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="pfchartfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.15" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        {[minV, maxV].map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 5} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="Space Mono,monospace">{fmt(v)}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#pfchartfill)" />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={toX(0)} cy={toY(vals[0])} r="2" fill={col} />
        <circle cx={toX(points.length-1)} cy={toY(vals[vals.length-1])} r="3.5" fill={col} stroke="var(--bg)" strokeWidth="1.5" />
        {xLabelIdxs.map(i => (
          <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontFamily="Space Mono,monospace">{points[i].label}</text>
        ))}
      </svg>
    </div>
  );
}

/* ─── Compute daily portfolio value from price snapshots ─── */
function computePortfolioHistory(rows, cardIds) {
  if (!rows.length || !cardIds.length) return [];
  const byCard = {};
  for (const r of rows) {
    if (!byCard[r.card_id]) byCard[r.card_id] = [];
    byCard[r.card_id].push({ price: r.price_market, ts: new Date(r.captured_at).getTime() });
  }
  const days = [...new Set(rows.map(r => r.captured_at.slice(0, 10)))].sort();
  if (days.length < 2) return [];
  return days.map(day => {
    const dayEnd = new Date(day + 'T23:59:59Z').getTime();
    let total = 0, priced = 0;
    for (const id of cardIds) {
      const snaps = byCard[id] || [];
      const snap = [...snaps].reverse().find(s => s.ts <= dayEnd);
      if (snap) { total += snap.price; priced++; }
    }
    if (priced === 0) return null;
    return { label: new Date(day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: total };
  }).filter(Boolean);
}

/* --- PORTFOLIO VIEW --- */
export function PortfolioView({ isAuthed, onLogin, onExplore, cur, eurRate }) {
  const [positions, setPositions]   = useState([]);
  const [priceMap, setPriceMap]     = useState({});
  const [pfPoints, setPfPoints]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [confirmId, setConfirmId]   = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [watchBusy, setWatchBusy]   = useState({});   // { rowId: true }
  const [watched, setWatched]       = useState({});    // { rowId: true }
  const [toast, setToast]           = useState("");

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2800); }, []);

  const fmt = useCallback((usd) => {
    if (usd == null || isNaN(usd)) return "—";
    return cur === "EUR" ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  }, [cur, eurRate]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCollection();
      const ids0 = [...new Set(data.map(p => p.card_api_id).filter(Boolean))];
      let dataWithLang = data;
      if (ids0.length) {
        const { data: langRows } = await supabase
          .from("cards")
          .select("id,lang")
          .in("id", ids0);
        const lm = {};
        for (const r of (langRows || [])) lm[r.id] = r.lang;
          const { data: cacheRows } = await supabase
                    .from("card_image_cache")
                    .select("card_id,cached_url,status")
                    .in("card_id", ids0)
                    .eq("status", "ready");
                  const cm = {};
                  for (const r of (cacheRows || [])) { if (!cm[r.card_id]) cm[r.card_id] = []; cm[r.card_id].push(r); }
                  dataWithLang = data.map(p => ({ ...p, lang: lm[p.card_api_id] || null, card_image_cache: cm[p.card_api_id] || [] }));
      }
      setPositions(dataWithLang);
      if (data.length > 0) {
        const ids = ids0;
        if (ids.length) {
          // "Now" price per card: must be the latest SPOT snapshot (timeframe IS NULL).
          // Without this filter, eBay "sold" aggregate rows (source=ebay_finding,
          // timeframe='7d'/'30d'/'90d' — see refresh-prices/index.ts) sort into the
          // same captured_at ordering and can shadow the true spot price for a card
          // whenever a sold-aggregate row lands at/after the spot row for that
          // refresh cycle, silently swapping "Now" for a rolling sold average.
          const { data: priceRows } = await supabase
            .from("card_prices")
            .select("card_id,price_market,captured_at")
            .in("card_id", ids)
            .is("timeframe", null)
            .order("captured_at", { ascending: false })
            .limit(ids.length * 4);
          const pm = {};
          for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
          setPriceMap(pm);

          // Portfolio value history (chart): fetch newest-first with a generous flat
          // safety cap, THEN sort ascending in JS before handing off to
          // computePortfolioHistory. Root-cause fix (Block 2): the previous version
          // ordered ascending and capped at `ids.length * 120` — once a collection's
          // total matching snapshots in the 90-day window exceeded that cap (routine
          // for a modest collection, since card_prices accumulates multiple
          // sources/day per card), Postgres returns the OLDEST N rows first and
          // silently drops everything newer. The chart then has no "day" entries past
          // that cutoff and visually freezes on an old date, even though fresher
          // prices exist in card_prices — exactly the reported "stuck around June 20"
          // symptom. Fetching DESC-first guarantees recent data is never the part
          // that gets truncated; the date-range filter below still bounds the query.
          const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          const HIST_SAFETY_CAP = Math.max(4000, ids.length * 150);
          const { data: histRowsDesc } = await supabase
            .from("card_prices")
            .select("card_id,price_market,captured_at")
            .in("card_id", ids)
            .gte("captured_at", since90)
            .is("timeframe", null)
            .order("captured_at", { ascending: false })
            .limit(HIST_SAFETY_CAP);
          const histRows = (histRowsDesc || [])
            .slice()
            .sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
          setPfPoints(computePortfolioHistory(histRows, ids));
        }
      } else {
        setPriceMap({});
        setPfPoints([]);
      }
    } catch (e) {
      setError(e.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthed) { setLoading(false); return; }
    load();
  }, [isAuthed, load]);

  const doRemove = useCallback(async (id) => {
    setRemoveBusy(true);
    await removeFromCollection(id);
    setPositions(ps => ps.filter(p => p.id !== id));
    setConfirmId(null);
    setRemoveBusy(false);
    flash("Removed from portfolio");
  }, [flash]);

  const doTrack = useCallback(async (pos) => {
    setWatchBusy(b => ({ ...b, [pos.id]: true }));
    const res = await addToWatchlist({
      tcg: pos.tcg,
      cardApiId: pos.card_api_id,
      cardName: pos.card_name,
      setName: pos.set_name || "",
      imageUrl: pos.image_url || null,
    });
    setWatchBusy(b => ({ ...b, [pos.id]: false }));
    if (res?.error) { flash("Could not track."); return; }
    setWatched(w => ({ ...w, [pos.id]: true }));
    flash("Tracking — we'll price it on the next refresh");
  }, [flash]);

  /* ── not authenticated ── */
  if (!isAuthed) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Sign in to save your portfolio"
        sub="Add the cards you own and track their value and P&L over time."
        cta="Sign in" onCta={onLogin} />
    </section>
  );

  /* ── loading ── */
  if (loading) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <div className="pf-header-skel">
        <div className="skel-line" style={{ height:30, width:"52%", marginBottom:10 }} />
        <div className="skel-line" style={{ height:16, width:"32%" }} />
      </div>
      {[0,1,2].map(i => (
        <div key={i} className="pf-row">
          <div style={{ width:44, height:62, borderRadius:8, flexShrink:0,
            background:"linear-gradient(100deg,var(--surface-2) 30%,var(--surface-3) 50%,var(--surface-2) 70%)",
            backgroundSize:"200% 100%", animation:"sh 1.4s linear infinite" }} />
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:7 }}>
            <div className="skel-line" style={{ width:"60%" }} />
            <div className="skel-line" style={{ width:"35%" }} />
          </div>
        </div>
      ))}
    </section>
  );

  /* ── error ── */
  if (error) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <div className="search-error">
        <Icon name="close" size={16} />
        <span>Could not load portfolio.</span>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft:"auto" }} onClick={load}>Retry</button>
      </div>
    </section>
  );

  /* ── empty ── */
  if (!positions.length) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Your portfolio is empty"
        sub="Search a card and add it to track its value and gain."
        cta="Find a card" onCta={onExplore} />
    </section>
  );

  /* ── compute totals (only priced positions contribute) ── */
  let totalValueUSD = 0, totalPaidUSD = 0, unpricedCount = 0, noPaidCount = 0;
  for (const pos of positions) {
    const priceRow  = priceMap[pos.card_api_id];
    const currentUSD = priceRow?.price_market ?? null;
    const paidRaw    = pos.purchase_price;
    const fmvCur     = pos.fmv_currency || cur;
    const paidUSD    = paidRaw != null
      ? (fmvCur === "EUR" ? paidRaw / eurRate : Number(paidRaw))
      : null;
    if (currentUSD != null) {
      totalValueUSD += currentUSD;
      if (paidUSD != null) totalPaidUSD += paidUSD;
    } else {
      unpricedCount++;
    }
    if (paidUSD == null) noPaidCount++;
  }
  const pnlUSD  = totalValueUSD - totalPaidUSD;
  const pnlPct  = totalPaidUSD > 0 ? (pnlUSD / totalPaidUSD) * 100 : null;
  const pnlPos  = pnlUSD >= 0;

  return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>

      {/* ── HEADER ── */}
      <div className="pf-header">
        <div className="pf-header-top">
          <span className="pf-label">Total Value</span>
          {unpricedCount > 0 && (
            <span className="pf-unpriced">{unpricedCount} unpriced</span>
          )}
        </div>
        <div className="pf-total">{fmt(totalValueUSD)}</div>
        {totalPaidUSD > 0 && (
          <div className={`pf-pnl ${pnlPos ? "gain" : "loss"}`}>
            <span>{pnlPos ? "+" : ""}{fmt(pnlUSD)}</span>
            {pnlPct != null && (
              <span className="pf-pnl-pct">{pnlPos ? "+" : ""}{pnlPct.toFixed(2)}%</span>
            )}
            <span className="pf-pnl-vs">vs paid</span>
          </div>
        )}
        <div className="pf-count">
          {positions.length - unpricedCount} of {positions.length} position{positions.length !== 1 ? "s" : ""} priced
        </div>
        {noPaidCount > 0 && (
          <div className="pf-nopaid">{noPaidCount} of {positions.length} without a purchase price — P&L not shown for these</div>
        )}
        {pfPoints.length >= 2 && (
          <PortfolioChart points={pfPoints} fmt={fmt} />
        )}
      </div>

      {/* ── LIST ── */}
      <div className="pf-list">
        {positions.map(pos => (
          <PortfolioRow
            key={pos.id}
            pos={pos}
            priceInfo={priceMap[pos.card_api_id] || null}
            cur={cur}
            eurRate={eurRate}
            fmt={fmt}
            isConfirm={confirmId === pos.id}
            onConfirm={() => setConfirmId(pos.id)}
            onCancelConfirm={() => setConfirmId(null)}
            onRemove={() => doRemove(pos.id)}
            onTrack={() => doTrack(pos)}
            trackBusy={!!watchBusy[pos.id]}
            trackDone={!!watched[pos.id]}
            removeBusy={removeBusy && confirmId === pos.id}
          />
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}
