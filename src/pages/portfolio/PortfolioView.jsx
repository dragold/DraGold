// DraGold — Portfolio 2.0 (Aug 2026).
// Unifica Collection/Portfolio in un'unica esperienza: le carte che l'utente
// possiede, con quantità, valore corrente e andamento storico reale.
// Dati riusati as-is: collection (RLS per user), card_prices (spot + storico).
// Nessuna nuova tabella: lo "storico giornaliero" è ricavato a lettura da
// card_prices (bucket per giorno, ultimo prezzo noto <= fine giornata),
// idempotente per costruzione — stesso giorno => stesso valore, nessun
// duplicato, nessuna scrittura periodica necessaria.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, listCollection, removeFromCollection, decrementOrRemoveCollection, addToWatchlist } from "../../supabase.js";
import { Icon } from "../../components/shared/Icon.jsx";
import { pickCardImage } from "../../components/shared/cardImage.js";
import { TCG_LIST, Empty } from "../../DraGold.jsx";

const RANGES = [
  { key: "7", label: "7D", days: 7 },
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "365", label: "1Y", days: 365 },
  { key: "all", label: "ALL", days: null },
];

/* ─── card object shape compatible with search results, for onOpenCard/AssetView deep-link ─── */
function toCardObject(pos) {
  return {
    id: pos.card_api_id,
    name: pos.card_name,
    set_name: pos.set_name || "",
    set_id: pos.set_id || null,
    tcg: pos.tcg,
    lang: pos.lang || null,
    card_number: pos.card_number || null,
    image_url: pos.image_url || null,
    card_image_cache: pos.card_image_cache || [],
  };
}

/* ─── build daily series from bounded card_prices rows ───
   totalSeries: [{day,label,value}] — value = sum(unit_price(day) × quantity) over ALL positions
   perPosition: { [positionId]: [{day,label,unitPrice,qty,value}] } — position_value = unit_price × quantity */
function buildSeries(rows, positions) {
  const byCard = {};
  for (const r of rows) {
    if (r.price_market == null) continue;
    (byCard[r.card_id] ||= []).push({ price: r.price_market, ts: new Date(r.captured_at).getTime() });
  }
  for (const k in byCard) byCard[k].sort((a, b) => a.ts - b.ts);
  const dayKeys = [...new Set(rows.map(r => r.captured_at.slice(0, 10)))].sort();
  const ptr = {};
  const totalSeries = [];
  const perPosition = {};
  for (const p of positions) perPosition[p.id] = [];
  for (const day of dayKeys) {
    const dayEnd = new Date(day + "T23:59:59Z").getTime();
    const label = new Date(day + "T12:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric" });
    let total = 0, any = false;
    for (const p of positions) {
      const snaps = byCard[p.card_api_id];
      if (!snaps || !snaps.length) continue;
      let i = ptr[p.card_api_id] ?? -1;
      while (i + 1 < snaps.length && snaps[i + 1].ts <= dayEnd) i++;
      ptr[p.card_api_id] = i;
      if (i < 0) continue;
      any = true;
      const qty = p.quantity || 1;
      const value = snaps[i].price * qty;
      total += value;
      perPosition[p.id].push({ day, label, unitPrice: snaps[i].price, qty, value });
    }
    if (any) totalSeries.push({ day, label, value: total });
  }
  return { totalSeries, perPosition };
}

/* ─── PortfolioRow — vista compatta (riuso invariato, ora cliccabile → Card Detail) ─── */
function PortfolioRow({ pos, priceInfo, cur, eurRate, fmt, isConfirm, onConfirm, onCancelConfirm, onRemove, onTrack, trackBusy, trackDone, removeBusy, onOpen, onDecrement, decrementBusy }) {
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
      <a className="pf-img" href={`/card/${encodeURIComponent(pos.card_api_id)}`}
        onClick={(e) => { e.preventDefault(); onOpen?.(); }} aria-label={`Open ${pos.card_name} card detail`}>
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt={pos.card_name} loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width:"100%", height:"100%" }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color:tcgInfo.color, fontSize:8 }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init" style={{ fontSize:13 }}>{initials}</span>
          </div>
        )}
      </a>

      <div className="pf-body">
        <div className="pf-name">
          {pos.card_name || "—"}
          {pos.quantity > 1 && (
            <span className="pf-qty-stepper" style={{ opacity: 0.6, fontWeight: 400 }}>
              {" "}×{pos.quantity}
              <button type="button" className="btn btn-ghost btn-sm" disabled={decrementBusy}
                onClick={(e) => { e.stopPropagation(); onDecrement?.(); }}
                aria-label={`Remove one copy of ${pos.card_name || "this card"}`}
                style={{ marginLeft: 6, padding: "0 6px" }}>
                {decrementBusy ? "…" : "−"}
              </button>
            </span>
          )}
        </div>
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

/* ─── Hero chart — valore totale del portfolio nel periodo selezionato ─── */
function HeroChart({ points, fmt }) {
  if (!points || points.length < 2) return null;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 720, H = 180, PT = 10, PB = 26, PL = 62, PR = 10;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length-1).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT+iH).toFixed(1) + ' Z';
  const xLabelIdxs = points.length <= 4 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs><linearGradient id="pfherofill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={col} stopOpacity="0.18" />
        <stop offset="100%" stopColor={col} stopOpacity="0" />
      </linearGradient></defs>
      {[minV, maxV].map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <text x={PL - 6} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="Space Mono,monospace">{fmt(v)}</text>
        </g>
      ))}
      <path d={areaPath} fill="url(#pfherofill)" />
      <path d={linePath} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={toX(0)} cy={toY(vals[0])} r="2.5" fill={col} />
      <circle cx={toX(points.length-1)} cy={toY(vals[vals.length-1])} r="4" fill={col} stroke="var(--bg)" strokeWidth="1.5" />
      {xLabelIdxs.map(i => (
        <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="Space Mono,monospace">{points[i].label}</text>
      ))}
    </svg>
  );
}

/* ─── Mini per-position chart (FASE 5) — valore della POSIZIONE (unit price × quantity),
   con tooltip: data / unit price × qty / position value ─── */
function MiniPositionChart({ series, fmt }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  if (!series || series.length < 2) {
    return <div className="pfg-chart-wrap" style={{ height: 34 }} />;
  }
  const vals = series.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 220, H = 46, P = 3;
  const iW = W - P * 2, iH = H - P * 2;
  const toX = i => P + (series.length === 1 ? iW / 2 : (i / (series.length - 1)) * iW);
  const toY = v => P + (1 - (v - minV) / range) * iH;
  const linePath = series.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(series.length-1).toFixed(1) + ',' + (P+iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (P+iH).toFixed(1) + ' Z';

  const onMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0, best = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(toX(i) - relX);
      if (d < best) { best = d; nearest = i; }
    }
    setHover({ i: nearest, relLeft: (clientX - rect.left) / rect.width });
  };

  const hp = hover ? series[hover.i] : null;
  // clamp tooltip so it never spills outside the card (FASE 13)
  const tipLeftPct = hover ? Math.min(82, Math.max(18, hover.relLeft * 100)) : 50;

  return (
    <div className="pfg-chart-wrap" ref={wrapRef}
      onMouseMove={onMove} onMouseLeave={() => setHover(null)}
      onTouchStart={onMove} onTouchMove={onMove} onTouchEnd={() => setHover(null)}>
      {hp && (
        <div className="pfg-tooltip" style={{ left: `${tipLeftPct}%` }}>
          <div className="pfg-tooltip-date">{hp.label}</div>
          <div>{fmt(hp.unitPrice)} × {hp.qty}</div>
          <div><b>{fmt(hp.value)}</b></div>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 34, display: "block" }}>
        <path d={areaPath} fill={col} opacity="0.12" />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" />
        {hp && <line x1={toX(hover.i)} y1={P} x2={toX(hover.i)} y2={H-P} stroke={col} strokeWidth="1" opacity="0.5" />}
        {hp && <circle cx={toX(hover.i)} cy={toY(hp.value)} r="2.5" fill={col} />}
      </svg>
    </div>
  );
}

/* ─── Grid card (default view, FASE 4) ─── */
function PortfolioGridCard({ pos, priceInfo, series, fmt, onOpen, onDecrement, decrementBusy }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(pos) || null;
  const tcgInfo = TCG_LIST.find(t => t.id === pos.tcg);
  const initials = (pos.card_name || "").replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  const qty = pos.quantity || 1;
  const unitUSD = priceInfo?.price_market ?? null;
  const totalUSD = unitUSD != null ? unitUSD * qty : null;

  const first = series && series.length ? series[0] : null;
  const baseline = first ? first.value : null;
  const changeUSD = (totalUSD != null && baseline != null) ? totalUSD - baseline : null;
  const changePct = (baseline != null && baseline > 0 && changeUSD != null) ? (changeUSD / baseline) * 100 : null;
  const changeCls = changeUSD == null ? "flat" : changeUSD > 0 ? "gain" : changeUSD < 0 ? "loss" : "flat";

  return (
    <a className="pfg-card" href={`/card/${encodeURIComponent(pos.card_api_id)}`}
      onClick={(e) => { e.preventDefault(); onOpen(); }}
      aria-label={`${pos.card_name}, ${qty} ${qty === 1 ? "copy" : "copies"}, ${totalUSD != null ? fmt(totalUSD) : "price unavailable"} total — open card detail`}>
      <div className="pfg-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width:"100%", height:"100%" }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color:tcgInfo.color, fontSize:9 }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init" style={{ fontSize:16 }}>{initials}</span>
          </div>
        )}
        <span className="pfg-qty-badge">×{qty}</span>
        <button type="button" className="pfg-qty-decrement" disabled={decrementBusy}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecrement?.(); }}
          aria-label={`Remove one copy of ${pos.card_name || "this card"}`}>
          {decrementBusy ? "…" : "−"}
        </button>
      </div>
      <div className="pfg-body">
        <div className="pfg-name">{pos.card_name || "—"}</div>
        {pos.set_name && <div className="pfg-set">{pos.set_name}</div>}
        <div className="pfg-vals">
          <span className="pfg-unit">{unitUSD != null ? `${fmt(unitUSD)} each` : "no price yet"}</span>
          <span className="pfg-total">{totalUSD != null ? fmt(totalUSD) : "—"}</span>
        </div>
        {changeUSD != null && (
          <div className={`pfg-change ${changeCls}`}>
            <span>{changeUSD >= 0 ? "+" : ""}{fmt(changeUSD)}</span>
            {changePct != null && <span>{changeUSD >= 0 ? "+" : ""}{changePct.toFixed(1)}%</span>}
          </div>
        )}
        <MiniPositionChart series={series} fmt={fmt} />
      </div>
    </a>
  );
}

/* ─── Biggest Movers / Most Valuable rail card ─── */
function RailCard({ pos, changeUSD, changePct, totalUSD, fmt, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false);
  const imgUrl = pickCardImage(pos) || null;
  const qty = pos.quantity || 1;
  const cls = changeUSD == null ? "" : changeUSD > 0 ? "gain" : changeUSD < 0 ? "loss" : "";
  const tcgInfo = TCG_LIST.find(t => t.id === pos.tcg);
  const initials = (pos.card_name || "")
    .replace(/[^a-zA-Z ]/g, "").trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
  return (
    <a className="pf-mover-card" href={`/card/${encodeURIComponent(pos.card_api_id)}`}
      onClick={(e) => { e.preventDefault(); onOpen(); }}
      aria-label={`${pos.card_name}, open card detail`}>
      <div className="pf-mover-img">
        {imgUrl && !imgFailed ? (
          <img src={imgUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <div className="card-img-ph" style={{ width: "100%", height: "100%" }}>
            {tcgInfo && <span className="card-img-ph-tcg" style={{ color: tcgInfo.color, fontSize: 8 }}>{tcgInfo.short}</span>}
            <span className="card-img-ph-init" style={{ fontSize: 12 }}>{initials}</span>
          </div>
        )}
      </div>
      <div className="pf-mover-name">{pos.card_name}</div>
      <div className="pf-mover-qty">{qty} {qty === 1 ? "copy" : "copies"} · {fmt(totalUSD)}</div>
      {changeUSD != null ? (
        <div className={`pf-mover-change ${cls}`}>
          {changeUSD >= 0 ? "+" : ""}{fmt(changeUSD)}
          {changePct != null && <span className="pf-mover-change-pct">{changeUSD >= 0 ? "+" : ""}{changePct.toFixed(1)}%</span>}
        </div>
      ) : <div className="pf-mover-change">—</div>}
    </a>
  );
}

/* --- PORTFOLIO VIEW --- */
export function PortfolioView({ isAuthed, onLogin, onExplore, cur, eurRate, onOpenCard }) {
  const [positions, setPositions]   = useState([]);
  const [priceMap, setPriceMap]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [confirmId, setConfirmId]   = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [watchBusy, setWatchBusy]   = useState({});
  const [watched, setWatched]       = useState({});
  const [toast, setToast]           = useState("");

  // Bounded price history, cached per range key — fetched lazily so a
  // portfolio with many cards never pulls unbounded history (FASE 12).
  const [histCache, setHistCache]   = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [heroRange, setHeroRange]   = useState("30");

  const [tcgFilter, setTcgFilter]   = useState("all");
  const [sortMode, setSortMode]     = useState("value");
  const [viewMode, setViewMode]     = useState("grid");

  const flash = useCallback((m) => { setToast(m); setTimeout(() => setToast(""), 2800); }, []);

  const fmt = useCallback((usd) => {
    if (usd == null || isNaN(usd)) return "—";
    return cur === "EUR" ? `€${(usd * eurRate).toFixed(2)}` : `$${Number(usd).toFixed(2)}`;
  }, [cur, eurRate]);

  const ids = useMemo(() => [...new Set(positions.map(p => p.card_api_id).filter(Boolean))], [positions]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await listCollection();
      const ids0 = [...new Set(data.map(p => p.card_api_id).filter(Boolean))];
      let dataWithLang = data;
      if (ids0.length) {
        // set_id fetched here too (single extra column, same query) so a card
        // opened from the Portfolio grid still resolves its set logo/link in
        // AssetView — the denormalized collection row doesn't carry it.
        const { data: langRows } = await supabase.from("cards").select("id,lang,set_id").in("id", ids0);
        const lm = {};
        for (const r of (langRows || [])) lm[r.id] = { lang: r.lang, set_id: r.set_id };
        const { data: cacheRows } = await supabase
          .from("card_image_cache").select("card_id,cached_url,status").in("card_id", ids0).eq("status", "ready");
        const cm = {};
        for (const r of (cacheRows || [])) { if (!cm[r.card_id]) cm[r.card_id] = []; cm[r.card_id].push(r); }
        dataWithLang = data.map(p => ({ ...p, lang: lm[p.card_api_id]?.lang || null, set_id: lm[p.card_api_id]?.set_id || null, card_image_cache: cm[p.card_api_id] || [] }));
      }
      setPositions(dataWithLang);
      if (ids0.length) {
        // "Now" price per card: latest SPOT snapshot only (timeframe IS NULL) —
        // eBay sold-aggregate rows must never shadow the true spot price.
        const { data: priceRows } = await supabase
          .from("card_prices")
          .select("card_id,price_market,captured_at")
          .in("card_id", ids0)
          .is("timeframe", null)
          .order("captured_at", { ascending: false })
          .limit(ids0.length * 4);
        const pm = {};
        for (const p of (priceRows || [])) { if (!pm[p.card_id]) pm[p.card_id] = p; }
        setPriceMap(pm);
      } else {
        setPriceMap({});
      }
      setHistCache({});
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

  // Bounded history fetch for a given range key — single query, no N+1
  // (one .in(card_id, ids) call covers every position at once).
  const ensureHistory = useCallback(async (rangeKey) => {
    if (!ids.length || histCache[rangeKey]) return;
    const def = RANGES.find(r => r.key === rangeKey);
    setHistLoading(true);
    try {
      let q = supabase.from("card_prices").select("card_id,price_market,captured_at")
        .in("card_id", ids).is("timeframe", null).order("captured_at", { ascending: false });
      if (def?.days) {
        const since = new Date(Date.now() - def.days * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("captured_at", since);
      }
      const cap = def?.days ? Math.min(30000, Math.max(4000, ids.length * def.days)) : Math.min(30000, Math.max(6000, ids.length * 250));
      const { data } = await q.limit(cap);
      const sorted = (data || []).slice().sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));
      setHistCache(h => ({ ...h, [rangeKey]: sorted }));
    } finally {
      setHistLoading(false);
    }
  }, [ids, histCache]);

  // Default 30D window powers the hero (default range), every mini-chart and
  // the Biggest Movers / Most Valuable calculations.
  useEffect(() => { if (ids.length) ensureHistory("30"); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ids.length && heroRange !== "30") ensureHistory(heroRange); }, [heroRange, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const miniSeries = useMemo(() => buildSeries(histCache["30"] || [], positions), [histCache, positions]);
  const heroSeries  = useMemo(() => {
    if (heroRange === "30") return miniSeries;
    return buildSeries(histCache[heroRange] || [], positions);
  }, [heroRange, histCache, positions, miniSeries]);

  const doRemove = useCallback(async (id) => {
    setRemoveBusy(true);
    await removeFromCollection(id);
    setPositions(ps => ps.filter(p => p.id !== id));
    setConfirmId(null);
    setRemoveBusy(false);
    flash("Removed from portfolio");
  }, [flash]);

  // Rimuove una singola copia (gemella di addCollection/addOrIncrementCollection
  // in AssetView, stessa RPC atomica decrement_or_remove_collection). A
  // differenza di doRemove (elimina sempre l'intera posizione), qui a
  // quantity 1 la riga viene comunque eliminata dal server: sync-iamo lo
  // stato locale di conseguenza invece di limitarci a decrementare.
  const [decrementBusyId, setDecrementBusyId] = useState(null);
  const doDecrement = useCallback(async (pos) => {
    if (decrementBusyId) return;
    setDecrementBusyId(pos.id);
    const res = await decrementOrRemoveCollection(pos.card_api_id);
    setDecrementBusyId(null);
    if (res?.error || !res?.data) { flash("Could not remove copy."); return; }
    const row = res.data;
    if (row.out_deleted) {
      setPositions(ps => ps.filter(p => p.id !== pos.id));
      flash("Removed from portfolio");
    } else {
      setPositions(ps => ps.map(p => p.id === pos.id ? { ...p, quantity: row.quantity } : p));
      flash(`Copy removed — you now have ${row.quantity}`);
    }
  }, [decrementBusyId, flash]);

  const doTrack = useCallback(async (pos) => {
    setWatchBusy(b => ({ ...b, [pos.id]: true }));
    const res = await addToWatchlist({
      tcg: pos.tcg, cardApiId: pos.card_api_id, cardName: pos.card_name,
      setName: pos.set_name || "", imageUrl: pos.image_url || null,
    });
    setWatchBusy(b => ({ ...b, [pos.id]: false }));
    if (res?.error) { flash("Could not track."); return; }
    setWatched(w => ({ ...w, [pos.id]: true }));
    flash("Tracking — we'll price it on the next refresh");
  }, [flash]);

  const openPosition = useCallback((pos) => {
    if (onOpenCard) onOpenCard(toCardObject(pos));
  }, [onOpenCard]);

  /* ── not authenticated ── */
  if (!isAuthed) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Sign in to save your portfolio"
        sub="Add the cards you own and track their value, quantity and history over time."
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
      <div className="pf-grid">
        {[0,1,2,3].map(i => (
          <div key={i} style={{ borderRadius:16, overflow:"hidden", background:"var(--surface)", border:"1px solid var(--border)" }}>
            <div style={{ aspectRatio:"5/7", background:"linear-gradient(100deg,var(--surface-2) 30%,var(--surface-3) 50%,var(--surface-2) 70%)", backgroundSize:"200% 100%", animation:"sh 1.4s linear infinite" }} />
            <div style={{ padding:12, display:"flex", flexDirection:"column", gap:7 }}>
              <div className="skel-line" style={{ width:"80%" }} />
              <div className="skel-line" style={{ width:"45%" }} />
            </div>
          </div>
        ))}
      </div>
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

  /* ── empty (FASE 9) ── */
  if (!positions.length) return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>
      <Empty icon="wallet"
        title="Your portfolio is empty"
        sub="Start building your collection — search a card and add it to track value, quantity and history."
        cta="Explore Cards" onCta={onExplore} />
    </section>
  );

  /* ── totals (live, priceMap-based — only priced positions contribute) ── */
  let totalValueUSD = 0, totalPaidUSD = 0, unpricedCount = 0, noPaidCount = 0;
  for (const pos of positions) {
    const priceRow  = priceMap[pos.card_api_id];
    const currentUSD = priceRow?.price_market ?? null;
    const qty = pos.quantity || 1;
    const paidRaw    = pos.purchase_price;
    const fmvCur     = pos.fmv_currency || cur;
    const paidUSD    = paidRaw != null ? (fmvCur === "EUR" ? paidRaw / eurRate : Number(paidRaw)) : null;
    if (currentUSD != null) {
      totalValueUSD += currentUSD * qty;
      if (paidUSD != null) totalPaidUSD += paidUSD * qty;
    } else {
      unpricedCount++;
    }
    if (paidUSD == null) noPaidCount++;
  }
  const pnlUSD = totalValueUSD - totalPaidUSD;
  const pnlPct = totalPaidUSD > 0 ? (pnlUSD / totalPaidUSD) * 100 : null;
  const pnlPos = pnlUSD >= 0;

  // Period change (linked to the selected range pill) — baseline is the
  // oldest point available in that window, current is the live total above.
  const heroPts = heroSeries.totalSeries;
  const periodBaseline = heroPts.length ? heroPts[0].value : null;
  const periodChangeUSD = periodBaseline != null ? totalValueUSD - periodBaseline : null;
  const periodChangePct = (periodBaseline != null && periodBaseline > 0) ? (periodChangeUSD / periodBaseline) * 100 : null;
  const periodPos = periodChangeUSD != null ? periodChangeUSD >= 0 : null;

  // Real "last updated" — max captured_at across this portfolio's own spot
  // prices. Never Date.now()/page-load time (FASE 11).
  let lastUpdatedTs = null;
  for (const k in priceMap) {
    const t = priceMap[k]?.captured_at ? new Date(priceMap[k].captured_at).getTime() : null;
    if (t != null && (lastUpdatedTs == null || t > lastUpdatedTs)) lastUpdatedTs = t;
  }
  const lastUpdatedLabel = lastUpdatedTs != null
    ? new Date(lastUpdatedTs).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      + " · " + new Date(lastUpdatedTs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Per-position change over the 30D mini window — feeds grid cards, movers, most valuable.
  const perPositionChange = {};
  for (const pos of positions) {
    const series = miniSeries.perPosition[pos.id] || [];
    const qty = pos.quantity || 1;
    const unitUSD = priceMap[pos.card_api_id]?.price_market ?? null;
    const totalUSD = unitUSD != null ? unitUSD * qty : null;
    const baseline = series.length ? series[0].value : null;
    const changeUSD = (totalUSD != null && baseline != null) ? totalUSD - baseline : null;
    const changePct = (baseline != null && baseline > 0 && changeUSD != null) ? (changeUSD / baseline) * 100 : null;
    perPositionChange[pos.id] = { totalUSD, changeUSD, changePct, series };
  }

  const biggestMovers = positions
    .filter(p => perPositionChange[p.id].changeUSD != null)
    .slice()
    .sort((a, b) => Math.abs(perPositionChange[b.id].changeUSD) - Math.abs(perPositionChange[a.id].changeUSD))
    .slice(0, 8);

  const mostValuable = positions
    .filter(p => perPositionChange[p.id].totalUSD != null)
    .slice()
    .sort((a, b) => perPositionChange[b.id].totalUSD - perPositionChange[a.id].totalUSD)
    .slice(0, 10);

  // Filter (TCG chips) + sort — all client-side on already-loaded positions,
  // no extra query (FASE 8/12).
  let visible = tcgFilter === "all" ? positions : positions.filter(p => p.tcg === tcgFilter);
  visible = visible.slice().sort((a, b) => {
    const ca = perPositionChange[a.id], cb = perPositionChange[b.id];
    if (sortMode === "value") return (cb.totalUSD ?? -1) - (ca.totalUSD ?? -1);
    if (sortMode === "gain") return (cb.changeUSD ?? -Infinity) - (ca.changeUSD ?? -Infinity);
    if (sortMode === "loss") return (ca.changeUSD ?? Infinity) - (cb.changeUSD ?? Infinity);
    return new Date(b.added_at || 0) - new Date(a.added_at || 0); // recent
  });

  const tcgPresent = TCG_LIST.filter(t => positions.some(p => p.tcg === t.id));

  return (
    <section className="view">
      <div className="view-h"><h2 className="view-t">Portfolio</h2></div>

      {/* ── HERO ── */}
      <div className="pf-header">
        <div className="pf-header-top">
          <span className="pf-label">Total Value</span>
          {unpricedCount > 0 && <span className="pf-unpriced">{unpricedCount} unpriced</span>}
        </div>
        <div className="pf-total">{fmt(totalValueUSD)}</div>

        {periodChangeUSD != null && (
          <div className={`pf-pnl ${periodPos ? "gain" : "loss"}`}>
            <span>{periodPos ? "+" : ""}{fmt(periodChangeUSD)}</span>
            {periodChangePct != null && <span className="pf-pnl-pct">{periodPos ? "+" : ""}{periodChangePct.toFixed(2)}%</span>}
          </div>
        )}
        {totalPaidUSD > 0 && (
          <div className="pf-nopaid" style={{ marginBottom: 4 }}>
            {pnlPos ? "+" : ""}{fmt(pnlUSD)}{pnlPct != null ? ` (${pnlPos ? "+" : ""}${pnlPct.toFixed(2)}%)` : ""} vs paid
          </div>
        )}

        <div className="pf-range-pills">
          {RANGES.map(r => (
            <button key={r.key} className={`pf-range-pill ${heroRange === r.key ? "on" : ""}`}
              onClick={() => setHeroRange(r.key)}>{r.label}</button>
          ))}
        </div>
        <div className={`pf-hero-chart ${histLoading && heroRange !== "30" ? "loading" : ""}`}>
          {heroPts.length >= 2 ? <HeroChart points={heroPts} fmt={fmt} /> : (
            <div className="pf-nopaid">Not enough price history yet for this range.</div>
          )}
        </div>

        <div className="pf-count">
          {positions.length - unpricedCount} of {positions.length} position{positions.length !== 1 ? "s" : ""} priced
        </div>
        {noPaidCount > 0 && (
          <div className="pf-nopaid">{noPaidCount} of {positions.length} without a purchase price — P&amp;L not shown for these</div>
        )}
        {lastUpdatedLabel && (
          <div className="pf-updated"><span className="pf-updated-dot" />Last updated · {lastUpdatedLabel}</div>
        )}
      </div>

      {/* ── BIGGEST MOVERS (FASE 6) ── */}
      {biggestMovers.length > 0 && (
        <div className="pf-section">
          <div className="pf-section-h"><span className="pf-section-t"><Icon name="trend-up" size={14} />Biggest Movers</span></div>
          <div className="pf-rail">
            {biggestMovers.map(pos => (
              <RailCard key={pos.id} pos={pos}
                totalUSD={perPositionChange[pos.id].totalUSD}
                changeUSD={perPositionChange[pos.id].changeUSD}
                changePct={perPositionChange[pos.id].changePct}
                fmt={fmt} onOpen={() => openPosition(pos)} />
            ))}
          </div>
        </div>
      )}

      {/* ── MOST VALUABLE (FASE 7) ── */}
      {mostValuable.length > 0 && (
        <div className="pf-section">
          <div className="pf-section-h"><span className="pf-section-t"><Icon name="trophy" size={14} />Most Valuable</span></div>
          <div className="pf-rail">
            {mostValuable.map(pos => (
              <RailCard key={pos.id} pos={pos}
                totalUSD={perPositionChange[pos.id].totalUSD}
                changeUSD={perPositionChange[pos.id].changeUSD}
                changePct={perPositionChange[pos.id].changePct}
                fmt={fmt} onOpen={() => openPosition(pos)} />
            ))}
          </div>
        </div>
      )}

      {/* ── FILTERS / SORT (FASE 8) ── */}
      <div className="pf-filterbar">
        <div className="pf-tcg-chips">
          <button className={`pf-tcg-chip ${tcgFilter === "all" ? "on" : ""}`} onClick={() => setTcgFilter("all")}>All</button>
          {tcgPresent.map(t => (
            <button key={t.id} className={`pf-tcg-chip ${tcgFilter === t.id ? "on" : ""}`} onClick={() => setTcgFilter(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="pf-filterbar-r">
          <select className="pf-sort-select" value={sortMode} onChange={e => setSortMode(e.target.value)} aria-label="Sort positions">
            <option value="value">Highest Value</option>
            <option value="gain">Biggest Gain</option>
            <option value="loss">Biggest Loss</option>
            <option value="recent">Recently Added</option>
          </select>
          <div className="pf-view-toggle" role="group" aria-label="Layout">
            <button className={`pf-view-btn ${viewMode === "grid" ? "on" : ""}`} onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"}>
              <Icon name="grid" size={15} />
            </button>
            <button className={`pf-view-btn ${viewMode === "compact" ? "on" : ""}`} onClick={() => setViewMode("compact")} aria-label="Compact view" aria-pressed={viewMode === "compact"}>
              <Icon name="list" size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── GRID / COMPACT (FASE 4) ── */}
      {viewMode === "grid" ? (
        <div className="pf-grid">
          {visible.map(pos => (
            <PortfolioGridCard key={pos.id} pos={pos}
              priceInfo={priceMap[pos.card_api_id] || null}
              series={perPositionChange[pos.id].series}
              fmt={fmt}
              onOpen={() => openPosition(pos)}
              onDecrement={() => doDecrement(pos)}
              decrementBusy={decrementBusyId === pos.id} />
          ))}
        </div>
      ) : (
        <div className="pf-list">
          {visible.map(pos => (
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
              onOpen={() => openPosition(pos)}
              trackBusy={!!watchBusy[pos.id]}
              trackDone={!!watched[pos.id]}
              removeBusy={removeBusy && confirmId === pos.id}
              onDecrement={() => doDecrement(pos)}
              decrementBusy={decrementBusyId === pos.id}
            />
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </section>
  );
}
