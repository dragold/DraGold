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

/** Per (source, sub_type, giorno) tiene una sola osservazione — collassa gli
 * snapshot ripetuti dello stesso giorno ma preserva la dispersione reale
 * fra fonti/giorni. Usato per low/median/high. */
function dedupeBySourceSubtypeDay(obs) {
  const best = new Map();
  for (const o of obs) {
    const k = `${o.source}|${o.sub_type || ''}|${String(o.observed_at).slice(0, 10)}`;
    const prev = best.get(k);
    if (!prev || new Date(o.observed_at) > new Date(prev.observed_at)) best.set(k, o);
  }
  return [...best.values()];
}

// Ordine di preferenza per il sub_type "primario" a parita' di osservazioni.
const SUBTYPE_PREF = ['normal', '', 'holofoil', 'foil', 'reverse holofoil', 'reverse foil'];

/**
 * Sceglie il sub_type PRIMARIO (la stampa di cui riportiamo il valore headline)
 * e restituisce SOLO le sue osservazioni. Evita di mescolare finish diversi
 * (Normal €1 + Holo €15 -> €8, che non corrisponde a nessun prodotto reale).
 */
function primarySubtypeObservations(obs) {
  if (!obs.length) return obs;
  const byType = new Map();
  for (const o of obs) {
    const k = (o.sub_type || '').toLowerCase();
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(o);
  }
  if (byType.size === 1) return obs;
  let bestKey = null;
  let bestScore = -1;
  for (const [k, list] of byType) {
    const days = new Set(list.map((o) => String(o.observed_at).slice(0, 10))).size;
    const pref = SUBTYPE_PREF.indexOf(k);
    const score = days * 100 + (pref >= 0 ? SUBTYPE_PREF.length - pref : 0);
    if (score > bestScore) { bestScore = score; bestKey = k; }
  }
  return byType.get(bestKey);
}

// Osservazione "placeholder" TCGplayer: un singolo annuncio assurdo senza
// mercato reale (low == mid == high, valore alto). Non e' un prezzo di mercato.
function isPlaceholderObservation(o) {
  const r = o.raw || {};
  const flat = r.low != null && r.low === r.mid && r.mid === r.high;
  return flat && Number(o.price) >= 1000;
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
    .filter((o) => o && Number.isFinite(o.price_eur) && o.price_eur > 0 && new Date(o.observed_at).getTime() >= cutoff)
    .filter((o) => !isPlaceholderObservation(o));

  const marketishAll = valid.filter((o) => o.kind === 'market' || o.kind === 'sold');
  const listings = valid.filter((o) => o.kind === 'listing');
  // Solo il sub_type primario alimenta il valore headline (no blend di finish).
  const marketish = primarySubtypeObservations(marketishAll);

  const base = {
    card_id: cardId,
    canonical_card_id: canonicalId,
    tcg,
    currency,
    estimated_value: null,
    observed_low: null,
    observed_median: null,
    observed_high: null,
    n_observations: marketish.length || valid.length,
    n_sources: new Set((marketish.length ? marketish : valid).map((o) => o.source)).size,
    sources: [...new Set((marketish.length ? marketish : valid).map((o) => o.source))].sort(),
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
  let priceBasis = [];        // TUTTI i prezzi (primary sub_type) nella finestra usata
  let listingOnly = false;

  const inWindow = (list, days) => list.filter((o) => new Date(o.observed_at).getTime() >= now.getTime() - days * DAY);
  const window30 = inWindow(marketish, PRIMARY_WINDOW_DAYS);
  const usedWindow = window30.length ? window30 : marketish;

  if (usedWindow.length) {
    // stima = mediana pesata sulle osservazioni deduplicate per (source, sub_type)
    // -> nessuna fonte domina per volume; ma low/median/high riflettono la
    // dispersione REALE di tutte le osservazioni usate (fix "range a larghezza 0").
    const deduped = dedupeBySourceSubtype(usedWindow);
    const entries = deduped.map((o) => ({
      value: o.price_eur,
      weight: recencyWeight((now.getTime() - new Date(o.observed_at).getTime()) / DAY),
    }));
    base.estimated_value = round2(weightedMedian(entries));
    priceBasis = dedupeBySourceSubtypeDay(usedWindow).map((o) => o.price_eur);
  } else if (listings.length) {
    listingOnly = true;
    const dl = dedupeBySourceSubtype(listings);
    const m = median(dl.map((o) => o.price_eur));
    base.estimated_value = m != null ? round2(m * LISTING_DISCOUNT) : null;
    priceBasis = dedupeBySourceSubtypeDay(listings).map((o) => o.price_eur);
  }

  if (priceBasis.length) {
    const distinct = [...new Set(priceBasis.map((p) => round2(p)))];
    if (distinct.length === 1) {
      base.observed_low = base.observed_median = base.observed_high = distinct[0];
    } else {
      base.observed_low = round2(quantile(priceBasis, 0.1));
      base.observed_median = round2(quantile(priceBasis, 0.5));
      base.observed_high = round2(quantile(priceBasis, 0.9));
    }
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
  // Valore alto + nessuna corroborazione (1 osservazione, 1 fonte): un singolo
  // snapshot TCGplayer da migliaia di euro non e' "medium" — serve conferma.
  if (base.estimated_value != null && base.estimated_value >= 2000
      && base.n_observations < 2 && base.n_sources < 2 && base.confidence === 'medium') {
    base.confidence = 'low';
    base.confidence_reason = { ...(base.confidence_reason || {}), capped: 'valore alto senza corroborazione (1 osservazione, 1 fonte): max low' };
  }
  if (base.estimated_value == null && base.confidence !== 'none') {
    base.confidence = 'none';
  }

  return base;
}

function round2(n) {
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
