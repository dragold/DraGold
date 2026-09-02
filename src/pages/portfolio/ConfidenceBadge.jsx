// DraGold — Portfolio Core (Fase 3)
// Badge di confidence per una valutazione. NESSUN livello "high": finché la
// fonte è unica (TCGplayer via TCGCSV), il massimo onesto è "Medium".
// Livelli: medium (neutro) · low (ambra) · none / assente ("Estimate pending").

import { normalizeConfidenceLevel, CONFIDENCE_LABEL, confidenceTitle } from '../../lib/portfolio/confidence.js';

export function ConfidenceBadge({ level, reason, size = 'sm' }) {
  const lvl = normalizeConfidenceLevel(level);
  if (lvl === 'none') {
    return <span className={`pf-conf pf-conf-none pf-conf-${size}`}>Estimate pending</span>;
  }
  return (
    <span className={`pf-conf pf-conf-${lvl} pf-conf-${size}`} title={confidenceTitle(reason)}>
      <span className="pf-conf-dot" aria-hidden="true" />
      {CONFIDENCE_LABEL[lvl]} confidence
    </span>
  );
}

export default ConfidenceBadge;
