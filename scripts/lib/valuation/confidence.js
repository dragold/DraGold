// DraGold — Market Valuation (Fase 2)
// La rubrica di confidence — SPIEGABILE, non ML, non finanza opaca.
//
// Quattro componenti lineari 0..1 su un insieme di osservazioni `kind='market'`
// in EUR degli ultimi 90 giorni:
//   sources      = min(n_fonti_distinte / 3, 1)
//   observations = min(n_osservazioni / 8, 1)
//   recency      = 1 se <7g · 0.6 se <30g · 0.25 se <90g · 0 oltre
//   agreement    = 1 - min(IQR / median, 1)   (0.5 se n<3 o median<=0)
//
//   score = 0.30*sources + 0.30*observations + 0.20*recency + 0.20*agreement
//   band  = none (n=0) · high (>=0.70) · medium (>=0.42) · low (>=0.18) · none

import { median, iqr } from './stats.js';

const W = { sources: 0.30, observations: 0.30, recency: 0.20, agreement: 0.20 };

function recencyScore(newestAgeDays) {
  if (newestAgeDays == null) return 0;
  if (newestAgeDays < 7) return 1;
  if (newestAgeDays < 30) return 0.6;
  if (newestAgeDays < 90) return 0.25;
  return 0;
}

/**
 * @param {object} opts
 * @param {{price_eur:number, observed_at:string, source:string}[]} opts.observations
 *   - gia' filtrate a kind='market', price_eur non-null, ultimi ~90g
 * @param {Date} [opts.now]
 * @returns {{score:number, band:'high'|'medium'|'low'|'none', reason:object}}
 */
export function computeConfidence({ observations, now = new Date() } = {}) {
  const obs = (observations || []).filter((o) => o && Number.isFinite(o.price_eur));
  const n = obs.length;

  if (n === 0) {
    return { score: 0, band: 'none', reason: { n: 0, note: 'nessuna osservazione valida' } };
  }

  const nSources = new Set(obs.map((o) => o.source)).size;
  const prices = obs.map((o) => o.price_eur);
  const med = median(prices);
  const spread = iqr(prices);

  const newestMs = Math.max(...obs.map((o) => new Date(o.observed_at).getTime()));
  const newestAgeDays = (now.getTime() - newestMs) / 86_400_000;

  // "observations" conta bucket distinti (fonte, giorno di calendario) — 10
  // snapshot della stessa fonte nello stesso giorno = 1 osservazione, non 10.
  const buckets = new Set(obs.map((o) => `${o.source}|${String(o.observed_at).slice(0, 10)}`)).size;

  const sources = Math.min(nSources / 3, 1);
  const observationsScore = Math.min(buckets / 8, 1);
  const recency = recencyScore(newestAgeDays);
  const agreement = (n >= 3 && med != null && med > 0 && spread != null)
    ? 1 - Math.min(spread / med, 1)
    : 0.5;

  let score = round3(
    W.sources * sources + W.observations * observationsScore + W.recency * recency + W.agreement * agreement,
  );

  // Regola di onestà: "high" richiede corroborazione da >=2 fonti indipendenti.
  // Una fonte sola, per quanto densa e fresca, non supera "medium".
  let singleSourceCapped = false;
  if (nSources < 2 && score > 0.69) { score = 0.69; singleSourceCapped = true; }

  let band = 'none';
  if (score >= 0.70) band = 'high';
  else if (score >= 0.42) band = 'medium';
  else if (score >= 0.18) band = 'low';

  return {
    score,
    band,
    reason: {
      score,
      band,
      sources: { value: round3(sources), n: nSources },
      observations: { value: round3(observationsScore), n, buckets },
      recency: { value: recency, newest_days: Math.round(newestAgeDays * 10) / 10 },
      agreement: { value: round3(agreement), iqr: spread != null ? round2(spread) : null, median: med != null ? round2(med) : null },
      ...(singleSourceCapped ? { capped: 'single-source: max medium (serve >=2 fonti per high)' } : {}),
    },
  };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function round3(n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; }
