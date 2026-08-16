export function PriceChart({ snaps, priceStr }) {
  const byDay = {};
  for (const s of snaps) {
    const day = s.captured_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { sum: 0, n: 0 };
    byDay[day].sum += s.price_market;
    byDay[day].n++;
  }
  let points = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { sum, n }]) => ({
      value: sum / n,
      label: new Date(day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    }));
  if (points.length < 2) return null;

  // Mitigazione outlier: alcune fonti (es. "justtcg") producono sporadicamente
  // uno snapshot con un ordine di grandezza sbagliato rispetto al resto della
  // serie (es. €854 in mezzo a snapshot coerenti intorno a €5). Non è un bug di
  // questo componente — la logica min/max sotto è corretta sui dati che riceve —
  // è un problema di qualità dato lato pipeline, da correggere alla fonte in un
  // task dedicato. Qui filtriamo solo i punti palesemente anomali (>8x o <1/8 la
  // mediana della serie) così la scala dell'asse Y non viene distorta da un
  // singolo snapshot corrotto. Soglia larga apposta per non tagliare mai una
  // reale variazione di prezzo (holo/reprint/hype), solo errori evidenti.
  if (points.length >= 3) {
    const sortedVals = points.map(p => p.value).slice().sort((a, b) => a - b);
    const mid = Math.floor(sortedVals.length / 2);
    const median = sortedVals.length % 2 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;
    if (median > 0) {
      const filtered = points.filter(p => p.value <= median * 8 && p.value >= median / 8);
      if (filtered.length >= 2) points = filtered;
    }
  }

  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const chg = vals[0] > 0 ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : 0;
  const gain = vals[vals.length - 1] >= vals[0];
  // North Star house rule: "No red/green price signals — value is never the
  // emotional centre of a screen." Direction is still legible (the ↑/↓ glyph
  // below), it just isn't color-coded; the line/fill/points stay the
  // product's one focus accent (gold) regardless of trend.
  const col = 'var(--gold)';
  // Wider margins than a dashboard sparkline needs — this is a labeled axis,
  // not a decoration, so the price labels get room to breathe at any width.
  const W = 360, H = 148, PT = 14, PB = 30, PL = 58, PR = 14;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length - 1).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' Z';
  const yTicks = [maxV, (minV + maxV) / 2, minV];
  const xLabelIdxs = points.length <= 5 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="price-chart-wrap">
      <div className="sec-h">
        <span className="sec-h-t">Price history</span>
        <span className="sec-h-line" />
        <span className="chart-chg">{gain ? '↑' : '↓'} {Math.abs(chg).toFixed(1)}%</span>
      </div>
      <div className="chart-card">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" preserveAspectRatio="xMidYMid meet">
          <defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.22" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient></defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} className="chart-grid" />
              <text x={PL - 8} y={toY(v) + 3.5} textAnchor="end" className="chart-axis-label">{priceStr(v)}</text>
            </g>
          ))}
          <path d={areaPath} fill="url(#chartfill)" />
          <path d={linePath} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <g key={i} className="chart-point">
              {/* Generous invisible hit target + native tooltip — real
                  interactivity without a charting dependency. */}
              <circle cx={toX(i)} cy={toY(p.value)} r="9" fill="transparent" />
              <circle cx={toX(i)} cy={toY(p.value)}
                r={i === points.length - 1 ? "3.5" : "2.2"} fill={col}
                stroke={i === points.length - 1 ? "var(--bg)" : "none"} strokeWidth="1.5" />
              <title>{`${p.label} · ${priceStr(p.value)}`}</title>
            </g>
          ))}
          {xLabelIdxs.map(i => (
            <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" className="chart-axis-label">{points[i].label}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}
