// DraGold — Market Valuation (Fase 2)
// Cambio valuta EUR-base. Fonte: Frankfurter (api.frankfurter.app, dati BCE,
// gratis, no API key). Puro (nessun I/O in questo file).

/**
 * @param {object} json - risposta di GET /latest?from=EUR&to=USD
 *   `{amount:1, base:'EUR', date:'2026-09-02', rates:{USD:1.16}}`
 * @returns {{base:string, date:string, rates:Record<string,number>}}
 */
export function parseFrankfurter(json) {
  if (!json || json.base !== 'EUR' || !json.rates || typeof json.rates !== 'object') {
    throw new Error(`parseFrankfurter: risposta inattesa: ${JSON.stringify(json).slice(0, 200)}`);
  }
  const rates = {};
  for (const [k, v] of Object.entries(json.rates)) {
    if (Number.isFinite(v) && v > 0) rates[k] = v;
  }
  return { base: 'EUR', date: String(json.date || '').slice(0, 10), rates };
}

/**
 * Converte `amount` da `currency` a EUR usando `ratesMap` (1 EUR = ratesMap[quote]).
 * @param {number} amount
 * @param {string} currency
 * @param {Record<string,number>} ratesMap
 * @returns {number|null}
 */
export function toEur(amount, currency, ratesMap) {
  if (!Number.isFinite(amount)) return null;
  const c = String(currency || '').toUpperCase();
  if (c === 'EUR') return round2(amount);
  const rate = ratesMap && ratesMap[c];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return round2(amount / rate);
}

/** Tasso currency->EUR (quanti EUR per 1 unita' di `currency`). */
export function eurPerUnit(currency, ratesMap) {
  const c = String(currency || '').toUpperCase();
  if (c === 'EUR') return 1;
  const rate = ratesMap && ratesMap[c];
  return Number.isFinite(rate) && rate > 0 ? 1 / rate : null;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
