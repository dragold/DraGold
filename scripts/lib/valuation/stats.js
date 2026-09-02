// DraGold — Market Valuation (Fase 2). Statistica di base. Puro.

function sortedNums(arr) {
  return (arr || []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
}

/** @param {number[]} nums @returns {number|null} */
export function median(nums) {
  return quantile(nums, 0.5);
}

/** Quantile lineare (tipo 7). @param {number[]} nums @param {number} q 0..1 */
export function quantile(nums, q) {
  const s = sortedNums(nums);
  if (!s.length) return null;
  if (s.length === 1) return s[0];
  const pos = (s.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Scarto interquartile (Q3 - Q1). @returns {number|null} */
export function iqr(nums) {
  const s = sortedNums(nums);
  if (s.length < 2) return null;
  const q1 = quantile(s, 0.25);
  const q3 = quantile(s, 0.75);
  return q1 == null || q3 == null ? null : q3 - q1;
}

/**
 * Mediana pesata: il valore v tale che la somma dei pesi <= v e >= v si
 * bilanciano. @param {{value:number, weight:number}[]} entries
 * @returns {number|null}
 */
export function weightedMedian(entries) {
  const e = (entries || [])
    .filter((x) => x && Number.isFinite(x.value) && Number.isFinite(x.weight) && x.weight > 0)
    .slice()
    .sort((a, b) => a.value - b.value);
  if (!e.length) return null;
  const total = e.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (let i = 0; i < e.length; i++) {
    acc += e[i].weight;
    if (acc >= total / 2) {
      // se cade esattamente a meta' fra due valori, media dei due
      if (acc === total / 2 && i + 1 < e.length) return (e[i].value + e[i + 1].value) / 2;
      return e[i].value;
    }
  }
  return e[e.length - 1].value;
}

/** Variazione percentuale da a -> b. @returns {number|null} */
export function pctChange(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return Math.round(((b - a) / a) * 1000) / 10;
}
