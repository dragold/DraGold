// DraGold — Market Valuation (Fase 2)
// Il motore di valutazione. Puro: nessun I/O, `now` iniettato, deterministico.
//
// Produce una riga `market_valuations` completa da un insieme di
// `market_observations` (gia' con `price_eur`).

import { median, quantile, weightedMedian, iqr, pctChange } from './stats.js';
import { computeConfidence } from './confidence.js';

const DAY = 86_400_000;
const VALUE_WINDOW_DAYS = 90;
const PRIMARY_WINDOW_DAYS = 30;
const LISTING_DISCOUNT = 0.92; // gli annunci attivi sono ask, non transati

/** Peso per recency: piu' recente = piu' peso (mezza vita ~14 giorni). */
function recencyWeight(ageDays) {
  return Math.exp(-Math.max(ageDays, 0) / 20);
}

/** Per (source, sub_type) tiene solo l'osservazione piu' recente. */
function dedupeBySourceSubtype(obs) {
  const best = new Map();
  for (const o of obs) {
    const k = `${o.source}|${o.sub_type || ''}`;
    const prev = best.get(k);
    if (!prev || new Date(o.observed_at) > new Date(prev.observed_at)) best.set(k, o);
  }
  return [...best.values()];
}

function medianInWindow(obs, now, fromDays, toDays) {
  const lo = now.getTime() - fromDays * DAY;
  const hi = now.getTime() - toDays * DAY;
  const inWin = obs.filter((o) => {
    const t = new Date(o.observed_at).getTime();
    return t > hi && t <= lo;
  });
  return inWin.length >= 2 ? { value: median(inWin.map((o) => o.price_eur)), n: inWin.length } : { value: null, n: inWin.length };
}

/**
 * @param {object} opts
 * @param {string} opts.cardId
 * @param {string|null} opts.canonicalId
 * @param {string} opts.tcg
 * @param {string} [opts.currency='EUR']
 * @param {Array} opts.observations - righe market_observations (price_eur, observed_at, kind, source, sub_type, condition)
 * @param {object|null} [opts.prior] - valutazione precedente (per riferimento, non usata nel calcolo base)
 * @param {Date} [opts.now]
 * @returns {object} riga market_valuations
 */
export function computeValuation({ cardId, canonicalId = null, tcg, currency = 'EUR', observations = [], now = new Date() } = {}) {
  const cutoff = now.getTime() - VALUE_WINDOW_DAYS * DAY;
  const valid = (observations || [])
    .filter((o) => o && Number.isFinite(o.price_eur) && o.price_eur > 0 && new Date(o.observed_at).getTime() >= cutoff);

  const marketish = valid.filter((o) => o.kind === 'market' || o.kind === 'sold');
  const listings = valid.filter((o) => o.kind === 'listing');

  const base = {
    card_id: cardId,
    canonical_card_id: canonicalId,
    tcg,
    currency,
    estimated_value: null,
    observed_low: null,
    observed_median: null,
    observed_high: null,
    n_observations: valid.length,
    n_sources: new Set(valid.map((o) => o.source)).size,
    sources: [...new Set(valid.map((o) => o.source))].sort(),
    trend_7d_pct: null,
    trend_30d_pct: null,
    newest_observed_at: valid.length ? new Date(Math.max(...valid.map((o) => new Date(o.observed_at).getTime()))).toISOString() : null,
    confidence: 'none',
    confidence_score: 0,
    confidence_reason: null,
    computed_at: now.toISOString(),
  };

  if (!valid.length) {
    base.confidence_reason = { n: 0, note: 'nessuna osservazione negli ultimi 90 giorni' };
    return base;
  }

  // ── estimated_value ─────────────────────────────────────────────────────────
  let priceBasis = [];        // le osservazioni usate per low/median/high
  let listingOnly = false;

  const recent30 = dedupeBySourceSubtype(marketish.filter((o) => new Date(o.observed_at).getTime() >= now.getTime() - PRIMARY_WINDOW_DAYS * DAY));
  const recent90 = dedupeBySourceSubtype(marketish);

  const pool = recent30.length ? recent30 : recent90;
  if (pool.length) {
    const entries = pool.map((o) => ({
      value: o.price_eur,
      weight: recencyWeight((now.getTime() - new Date(o.observed_at).getTime()) / DAY),
    }));
    base.estimated_value = round2(weightedMedian(entries));
    priceBasis = pool.map((o) => o.price_eur);
  } else if (listings.length) {
    listingOnly = true;
    const m = median(dedupeBySourceSubtype(listings).map((o) => o.price_eur));
    base.estimated_value = m != null ? round2(m * LISTING_DISCOUNT) : null;
    priceBasis = dedupeBySourceSubtype(listings).map((o) => o.price_eur);
  }

  if (priceBasis.length) {
    base.observed_low = round2(quantile(priceBasis, 0.1));
    base.observed_median = round2(quantile(priceBasis, 0.5));
    base.observed_high = round2(quantile(priceBasis, 0.9));
  }

  // ── trend ───────────────────────────────────────────────────────────────────
  const w0_7 = medianInWindow(marketish, now, 0, 7);
  const w7_14 = medianInWindow(marketish, now, 7, 14);
  base.trend_7d_pct = (w0_7.value != null && w7_14.value != null) ? pctChange(w7_14.value, w0_7.value) : null;

  const w0_30 = medianInWindow(marketish, now, 0, 30);
  const w30_60 = medianInWindow(marketish, now, 30, 60);
  base.trend_30d_pct = (w0_30.value != null && w30_60.value != null) ? pctChange(w30_60.value, w0_30.value) : null;

  // ── confidence ──────────────────────────────────────────────────────────────
  const conf = computeConfidence({ observations: marketish, now });
  base.confidence = conf.band;
  base.confidence_score = conf.score;
  base.confidence_reason = conf.reason;

  if (listingOnly && (base.confidence === 'high' || base.confidence === 'medium')) {
    base.confidence = 'low';
    base.confidence_reason = { ...(base.confidence_reason || {}), capped: 'solo annunci attivi (nessun prezzo di mercato): max low' };
  }
  if (base.estimated_value == null && base.confidence !== 'none') {
    base.confidence = 'none';
  }

  return base;
}

function round2(n) {
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
