// DraGold — Catalog Freshness (Fase 1)
// Diff CARD-level per un singolo set: quali numeri carta esistono upstream ma
// non in DraGold (e viceversa). Puro. Le chiavi sono gia' normalizzate dal
// chiamante (card-number-key.js), qui e' pura differenza insiemistica.

/**
 * @param {object} opts
 * @param {string} opts.setCode
 * @param {Set<string>} opts.upstreamNumbers - chiavi normalizzate
 * @param {Set<string>} opts.dbNumbers - chiavi normalizzate
 * @returns {{setCode:string, missingNumbers:string[], extraNumbers:string[]}}
 */
export function diffSetCards({ setCode, upstreamNumbers, dbNumbers } = {}) {
  const up = upstreamNumbers instanceof Set ? upstreamNumbers : new Set(upstreamNumbers || []);
  const db = dbNumbers instanceof Set ? dbNumbers : new Set(dbNumbers || []);
  const missingNumbers = [...up].filter((n) => n && !db.has(n)).sort();
  const extraNumbers = [...db].filter((n) => n && !up.has(n)).sort();
  return { setCode: setCode ?? null, missingNumbers, extraNumbers };
}
