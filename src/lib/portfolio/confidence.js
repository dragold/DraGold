// DraGold — Portfolio Core (Fase 3)
// Logica pura del badge confidence. INVARIANTE: nessun livello "high" — finché
// la fonte è unica, il massimo onesto è "medium" (vedi report Fase 2.1 §4).

/** @param {string} level @returns {'medium'|'low'|'none'} */
export function normalizeConfidenceLevel(level) {
  return level === 'low' ? 'low' : level === 'medium' ? 'medium' : 'none';
}

export const CONFIDENCE_LABEL = { medium: 'Medium', low: 'Low' };

/** Costruisce il `title`/tooltip leggibile dal confidence_reason (jsonb). */
export function confidenceTitle(reason) {
  if (!reason) return undefined;
  let r = reason;
  if (typeof reason === 'string') {
    try { r = JSON.parse(reason); } catch { return undefined; }
  }
  const parts = [];
  if (r?.observations?.n != null) parts.push(`${r.observations.n} observation${r.observations.n === 1 ? '' : 's'}`);
  if (r?.sources?.n != null) parts.push(`${r.sources.n} source${r.sources.n === 1 ? '' : 's'}`);
  if (r?.recency?.newest_days != null) {
    const d = Math.round(r.recency.newest_days);
    parts.push(d <= 0 ? 'updated today' : `updated ${d}d ago`);
  }
  if (r?.capped) parts.push(String(r.capped));
  return parts.join(' · ') || undefined;
}
