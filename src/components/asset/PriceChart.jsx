export function PriceChart({ snaps, priceStr }) {
  const byDay = {};
  for (const s of snaps) {
    const day = s.captured_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { sum: 0, n: 0 };
    byDay[day].sum += s.price_market;
    byDay[day].n++;
  }
  const points = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, { sum, n }]) => ({
      value: sum / n,
      label: new Date(day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    }));
  if (points.length < 2) return null;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = (maxV - minV) || (minV * 0.02) || 1;
  const gain = vals[vals.length - 1] >= vals[0];
  const col = gain ? 'var(--gain)' : 'var(--loss)';
  const W = 360, H = 120, PT = 12, PB = 28, PL = 52, PR = 12;
  const iW = W - PL - PR, iH = H - PT - PB;
  const toX = i => PL + (points.length === 1 ? iW / 2 : (i / (points.length - 1)) * iW);
  const toY = v => PT + (1 - (v - minV) / range) * iH;
  const linePath = points.map((p, i) => (i ? 'L' : 'M') + toX(i).toFixed(1) + ',' + toY(p.value).toFixed(1)).join(' ');
  const areaPath = linePath + ' L' + toX(points.length - 1).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' L' + toX(0).toFixed(1) + ',' + (PT + iH).toFixed(1) + ' Z';
  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const xLabelIdxs = points.length <= 5 ? points.map((_, i) => i) : [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <div className="price-chart-wrap">
      <div className="sec-h"><span className="sec-h-t">Price history</span><span className="sec-h-line" /></div>
      <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="chartfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.18" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient></defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={toY(v).toFixed(1)} x2={PL + iW} y2={toY(v).toFixed(1)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PL - 5} y={toY(v) + 4} textAnchor="end" fill="rgba(255,255,255,0.38)" fontSize="9" fontFamily="Space Mono,monospace">{priceStr(v)}</text>
          </g>
        ))}
        <path d={areaPath} fill="url(#chartfill)" />
        <path d={linePath} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={toX(0)} cy={toY(vals[0])} r="2.5" fill={col} />
        <circle cx={toX(points.length - 1)} cy={toY(vals[vals.length - 1])} r="3.5" fill={col} stroke="var(--bg)" strokeWidth="1.5" />
        {xLabelIdxs.map(i => (
          <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="9" fontFamily="Space Mono,monospace">{points[i].label}</text>
        ))}
      </svg>
    </div>
  );
}
