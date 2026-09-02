// DraGold — Portfolio Core (Fase 3)
// Riepilogo aggregato della confidence del portfolio. Barra segmentata neutra
// (nessun verde "buono" / rosso "male": è una misura di qualità del dato, non
// una performance).

export function PortfolioConfidence({ confidenceMix, onJumpToUnvalued }) {
  if (!confidenceMix) return null;
  const med = confidenceMix.medium || { valueEur: 0, pct: 0, count: 0 };
  const low = confidenceMix.low || { valueEur: 0, pct: 0, count: 0 };
  const noneCount = confidenceMix.none?.count || 0;
  const tracked = med.count + low.count;

  if (!tracked && !noneCount) return null;

  return (
    <div className="pf-confbar">
      <div className="pf-confbar-track" role="img"
        aria-label={`Valuation confidence: ${med.pct?.toFixed(0) || 0}% medium, ${low.pct?.toFixed(0) || 0}% low`}>
        {med.pct > 0 && <span className="pf-confbar-seg seg-medium" style={{ width: `${med.pct}%` }} />}
        {low.pct > 0 && <span className="pf-confbar-seg seg-low" style={{ width: `${low.pct}%` }} />}
      </div>
      <div className="pf-confbar-legend">
        {tracked > 0 && (
          <span><b>{med.pct?.toFixed(0) || 0}%</b> Medium{low.count > 0 ? <> · <b>{low.pct?.toFixed(0) || 0}%</b> Low</> : null}</span>
        )}
        {noneCount > 0 && (
          <button type="button" className="pf-confbar-none" onClick={onJumpToUnvalued}>
            {noneCount} not yet valued
          </button>
        )}
      </div>
      <p className="pf-confbar-note">
        Market value uses one source (TCGplayer). Confidence rises as more sources and days of data accumulate.
      </p>
    </div>
  );
}

export default PortfolioConfidence;
