// DraGold — Portfolio Core (Fase 3)
// Serie storica del valore portfolio da market_observations (via RPC
// portfolio_value_history). Puro.
//
// `historyRows`: [{ as_of, card_id, unit_eur }] — il client moltiplica per la
// quantity della posizione e somma per giorno.
// `state='building'` finché ci sono meno di 3 giorni con valore > 0.

const MIN_DAYS_FOR_CHART = 3;

/**
 * @param {object} opts
 * @param {Array} opts.historyRows
 * @param {Array} opts.positions - { card_api_id (o resolved), quantity }
 * @param {Map}   [opts.resolvedByInput] - input_card_id -> resolved_card_id (dall'RPC valuations)
 * @returns {{ series: Array<{day:string, label:string, valueEur:number}>, state:'building'|'ok' }}
 */
export function buildValueHistory({ historyRows = [], positions = [], resolvedByInput } = {}) {
  // qty per resolved card_id (sommando le posizioni che risolvono allo stesso)
  const qtyByCard = new Map();
  for (const p of positions) {
    const resolved = resolvedByInput?.get(p.card_api_id) || p.card_api_id;
    qtyByCard.set(resolved, (qtyByCard.get(resolved) || 0) + (p.quantity || 1));
  }

  const byDay = new Map(); // day -> valueEur
  for (const r of historyRows) {
    if (r.unit_eur == null) continue;
    const qty = qtyByCard.get(r.card_id);
    if (!qty) continue;
    const day = String(r.as_of).slice(0, 10);
    byDay.set(day, round2((byDay.get(day) || 0) + Number(r.unit_eur) * qty));
  }

  const series = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, valueEur]) => ({ day, valueEur, label: fmtLabel(day) }));

  const daysWithValue = series.filter((s) => s.valueEur > 0).length;
  return { series, state: daysWithValue >= MIN_DAYS_FOR_CHART ? 'ok' : 'building' };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function fmtLabel(day) {
  const d = new Date(day + 'T12:00:00Z');
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
