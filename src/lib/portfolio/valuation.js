// DraGold — Portfolio Core (Fase 3)
// Aggregazione: da `positions` (collection) + `valuations` (RPC portfolio_valuations)
// a un oggetto portfolio completo. Puro — nessun I/O, nessun React.
//
// Valuta in EUR. Una posizione senza `estimated_value` NON contribuisce ai
// totali/breakdown ma finisce in `unvalued` col suo motivo. `pct` sempre su
// `totalEur` (solo posizioni valutate).

function round2(n) {
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
}
function pctOf(part, whole) {
  return whole > 0 ? round2((part / whole) * 100) : 0;
}

/**
 * @param {object} opts
 * @param {Array} opts.positions - righe collection: { id, card_api_id, tcg, set_name, set_id, language, quantity, ... }
 * @param {Array} opts.valuations - righe RPC: { input_card_id, resolved_card_id, estimated_value, confidence, trend_7d_pct, trend_30d_pct, n_observations, n_sources, observed_low, observed_high, unavailable_reason }
 * @returns {object}
 */
export function buildPortfolioValuation({ positions = [], valuations = [] } = {}) {
  const valByInput = new Map();
  for (const v of valuations) valByInput.set(v.input_card_id, v);

  const priced = [];   // { pos, val, qty, positionValue }
  const unvalued = [];  // { card_api_id, reason }

  for (const pos of positions) {
    const val = valByInput.get(pos.card_api_id) || null;
    const qty = pos.quantity || 1;
    const rawEst = val != null ? val.estimated_value : null;
    const est = (rawEst != null && Number.isFinite(Number(rawEst)) && Number(rawEst) > 0) ? Number(rawEst) : null;
    if (est == null) {
      unvalued.push({ card_api_id: pos.card_api_id, reason: val?.unavailable_reason || 'no_data_yet' });
      continue;
    }
    priced.push({ pos, val, qty, positionValue: round2(est * qty) });
  }

  const totalEur = round2(priced.reduce((s, p) => s + p.positionValue, 0));

  // ── breakdown ────────────────────────────────────────────────────────────────
  const group = (keyFn) => {
    const m = new Map();
    for (const p of priced) {
      const k = keyFn(p) || '—';
      const cur = m.get(k) || { key: k, valueEur: 0, count: 0, tcg: p.pos.tcg };
      cur.valueEur = round2(cur.valueEur + p.positionValue);
      cur.count += 1;
      m.set(k, cur);
    }
    return [...m.values()]
      .map((x) => ({ ...x, pct: pctOf(x.valueEur, totalEur) }))
      .sort((a, b) => b.valueEur - a.valueEur);
  };

  const byTcg = group((p) => p.pos.tcg).map((x) => ({ tcg: x.key, valueEur: x.valueEur, pct: x.pct, count: x.count }));
  const bySet = group((p) => p.pos.set_name || p.pos.set_id).map((x) => ({ set: x.key, tcg: x.tcg, valueEur: x.valueEur, pct: x.pct, count: x.count }));
  const byLang = group((p) => (p.pos.language || 'en').toUpperCase()).map((x) => ({ lang: x.key, valueEur: x.valueEur, pct: x.pct, count: x.count }));

  // ── confidence mix (per valore) ──────────────────────────────────────────────
  const confidenceMix = { medium: { valueEur: 0, count: 0 }, low: { valueEur: 0, count: 0 }, none: { count: unvalued.length } };
  for (const p of priced) {
    const band = p.val.confidence === 'low' ? 'low' : 'medium';
    confidenceMix[band].valueEur = round2(confidenceMix[band].valueEur + p.positionValue);
    confidenceMix[band].count += 1;
  }
  confidenceMix.medium.pct = pctOf(confidenceMix.medium.valueEur, totalEur);
  confidenceMix.low.pct = pctOf(confidenceMix.low.valueEur, totalEur);

  // ── concentrazione ──────────────────────────────────────────────────────────
  const sortedByValue = [...priced].sort((a, b) => b.positionValue - a.positionValue);
  const cumPct = (n) => pctOf(sortedByValue.slice(0, n).reduce((s, p) => s + p.positionValue, 0), totalEur);
  const concentration = {
    top1Pct: cumPct(1),
    top5Pct: cumPct(5),
    top10Pct: cumPct(10),
    topPositions: sortedByValue.slice(0, 10).map((p) => ({
      card_api_id: p.pos.card_api_id, name: p.pos.card_name, valueEur: p.positionValue,
      pct: pctOf(p.positionValue, totalEur),
    })),
  };

  // ── movers / most valuable ──────────────────────────────────────────────────
  const movers = priced
    .map((p) => {
      const t = p.val.trend_7d_pct != null ? Number(p.val.trend_7d_pct)
        : p.val.trend_30d_pct != null ? Number(p.val.trend_30d_pct) : null;
      return t == null ? null : {
        card_api_id: p.pos.card_api_id, name: p.pos.card_name, trendPct: round2(t),
        window: p.val.trend_7d_pct != null ? '7d' : '30d', valueEur: p.positionValue,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.trendPct) - Math.abs(a.trendPct))
    .slice(0, 10);

  const mostValuable = sortedByValue.slice(0, 10).map((p) => ({
    card_api_id: p.pos.card_api_id, name: p.pos.card_name, valueEur: p.positionValue,
    confidence: p.val.confidence === 'low' ? 'low' : 'medium',
    unitEur: round2(Number(p.val.estimated_value)), qty: p.qty,
  }));

  return {
    totalEur,
    positionCount: positions.length,
    pricedCount: priced.length,
    unvaluedCount: unvalued.length,
    byTcg, bySet, byLang,
    confidenceMix,
    concentration,
    movers,
    mostValuable,
    unvalued,
    valuationByInput: valByInput, // per la UI (badge per riga)
  };
}
