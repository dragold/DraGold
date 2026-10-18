// src/lib/pricePulse.pure.js
// Logica pura e deterministica per trasformare market_observations in punti grafico per DraGold Price Pulse.
// Nessun effetto collaterale, nessun I/O.

export const MIN_OBSERVATIONS_FOR_CHART = 5;

/**
 * Normalizza e aggrega le osservazioni storiche per il grafico a linea.
 *
 * @param {Array} observations - array di righe da market_observations
 * @param {object} [options]
 * @param {'EUR'|'USD'} [options.targetCurrency='EUR'] - valuta di visualizzazione
 * @param {number} [options.minPoints=5] - numero minimo di osservazioni valide per mostrare il grafico
 * @returns {object} { hasSufficientData: boolean, points: Array, reason?: string, summary?: object }
 */
export function buildPricePulseSeries(observations, options = {}) {
  const targetCurrency = options.targetCurrency || 'EUR';
  const minPoints = options.minPoints ?? MIN_OBSERVATIONS_FOR_CHART;

  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      hasSufficientData: false,
      points: [],
      reason: 'no_history',
    };
  }

  // 0. Isola il sub_type primario (stessa logica di scripts/lib/valuation/valuation.js)
  // Evita di mescolare finish diversi (es. Normal 1€ con Holo 15€)
  const scopedObs = isolatePrimarySubtype(observations);

  // 1. Filtra record con prezzo valido
  const valid = [];
  for (const o of scopedObs) {
    if (!o) continue;

    // Seleziona il prezzo nella valuta richiesta
    let p = null;
    if (targetCurrency === 'EUR') {
      if (Number.isFinite(o.price_eur) && o.price_eur > 0) {
        p = o.price_eur;
      } else if (o.currency === 'EUR' && Number.isFinite(o.price) && o.price > 0) {
        p = o.price;
      }
    } else {
      // USD
      if (o.currency === 'USD' && Number.isFinite(o.price) && o.price > 0) {
        p = o.price;
      } else if (Number.isFinite(o.price_eur) && Number.isFinite(o.fx_rate) && o.fx_rate > 0) {
        p = o.price_eur * o.fx_rate;
      }
    }

    if (p == null || p <= 0) continue;

    // Data osservazione
    const dateStr = String(o.observed_at || '');
    const dateKey = dateStr.slice(0, 10); // 'YYYY-MM-DD'
    if (!dateKey || dateKey.length < 10) continue;

    // Banda low / high opzionale dal payload raw
    let low = null;
    let high = null;
    if (o.raw && typeof o.raw === 'object') {
      const rawLow = Number(o.raw.low);
      const rawHigh = Number(o.raw.high);

      if (targetCurrency === 'EUR') {
        if (o.currency === 'EUR') {
          if (Number.isFinite(rawLow) && rawLow > 0) low = round2(rawLow);
          if (Number.isFinite(rawHigh) && rawHigh > 0) high = round2(rawHigh);
        } else if (Number.isFinite(o.fx_rate) && o.fx_rate > 0) {
          if (Number.isFinite(rawLow) && rawLow > 0) low = round2(rawLow / o.fx_rate);
          if (Number.isFinite(rawHigh) && rawHigh > 0) high = round2(rawHigh / o.fx_rate);
        }
      } else if (targetCurrency === 'USD') {
        if (o.currency === 'USD') {
          if (Number.isFinite(rawLow) && rawLow > 0) low = round2(rawLow);
          if (Number.isFinite(rawHigh) && rawHigh > 0) high = round2(rawHigh);
        } else if (Number.isFinite(o.fx_rate) && o.fx_rate > 0) {
          if (Number.isFinite(rawLow) && rawLow > 0) low = round2(rawLow * o.fx_rate);
          if (Number.isFinite(rawHigh) && rawHigh > 0) high = round2(rawHigh * o.fx_rate);
        }
      }
    }

    // Assicura consistenza logica della banda se presente
    const validBand = low != null && high != null && low <= p && p <= high;

    valid.push({
      dateKey,
      timestamp: new Date(o.observed_at).getTime(),
      price: round2(p),
      currency: targetCurrency,
      subType: o.sub_type || 'Normal',
      low: validBand ? low : null,
      high: validBand ? high : null,
      source: o.source || 'tcgcsv',
    });
  }

  if (valid.length === 0) {
    return {
      hasSufficientData: false,
      points: [],
      reason: 'no_valid_prices',
    };
  }

  // 2. Deduplica per giorno (tenendo l'osservazione con timestamp più recente dello stesso giorno)
  const byDay = new Map();
  for (const item of valid) {
    const existing = byDay.get(item.dateKey);
    if (!existing || item.timestamp > existing.timestamp) {
      byDay.set(item.dateKey, item);
    }
  }

  // 3. Ordina cronologicamente
  const sortedPoints = [...byDay.values()].sort((a, b) => a.timestamp - b.timestamp);

  // 4. Verifica soglia minima di dati
  if (sortedPoints.length < minPoints) {
    return {
      hasSufficientData: false,
      points: sortedPoints,
      reason: 'insufficient_series',
      count: sortedPoints.length,
      minRequired: minPoints,
    };
  }

  // 5. Calcola statistiche sintetiche (min, max, variazione % dall'inizio)
  const prices = sortedPoints.map((pt) => pt.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = sortedPoints[0].price;
  const lastPrice = sortedPoints[sortedPoints.length - 1].price;
  const changePct = firstPrice > 0 ? round2(((lastPrice - firstPrice) / firstPrice) * 100) : 0;

  return {
    hasSufficientData: true,
    points: sortedPoints,
    summary: {
      currency: targetCurrency,
      firstPrice,
      lastPrice,
      minPrice,
      maxPrice,
      changePct,
      pointsCount: sortedPoints.length,
      from: sortedPoints[0].dateKey,
      to: sortedPoints[sortedPoints.length - 1].dateKey,
    },
  };
}

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

const SUBTYPE_PREF = ['normal', '', 'holofoil', 'foil', 'reverse holofoil', 'reverse foil'];

/**
 * Isola le osservazioni del sub_type primario (finish dominante per copertura temporale e preferenza).
 * Stessa formulazione matematica verificata in valuation.js.
 */
export function isolatePrimarySubtype(obs) {
  if (!Array.isArray(obs) || obs.length <= 1) return obs || [];
  const byType = new Map();
  for (const o of obs) {
    if (!o) continue;
    const k = (o.sub_type || '').toLowerCase();
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(o);
  }
  if (byType.size <= 1) return obs;
  let bestKey = null;
  let bestScore = -1;
  for (const [k, list] of byType) {
    const days = new Set(list.map((o) => String(o?.observed_at || '').slice(0, 10))).size;
    const pref = SUBTYPE_PREF.indexOf(k);
    const score = days * 100 + (pref >= 0 ? SUBTYPE_PREF.length - pref : 0);
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return byType.get(bestKey) || obs;
}
