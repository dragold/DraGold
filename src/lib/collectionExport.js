// DraGold — Collection export (CSV / JSON). Free, no tier gate.
// Pure builders + one tiny browser download helper (the only non-pure export,
// isolated at the bottom so the builders stay testable under node --test).
//
// Transparency by design: every valued row carries HOW its estimate was made
// (confidence, number of observations, number of sources, observed range,
// computed_at) — not just a number.

import { parseGrade, gradeBadge } from './grading.js';

export const COLLECTION_COLUMNS = [
  'card_id', 'card_name', 'tcg', 'set_name', 'set_id', 'card_number', 'rarity', 'language',
  'quantity', 'condition', 'graded', 'grade_company', 'grade_value', 'grade_label',
  'purchase_price', 'purchase_currency', 'purchase_date',
  'est_value_eur_each', 'est_value_eur_total', 'confidence', 'n_observations', 'n_sources',
  'observed_low_eur', 'observed_high_eur', 'valued_at', 'not_valued_reason',
  'added_at', 'notes',
];

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => (n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100);

/**
 * One flat row per collection position.
 * @param {Array} positions   collection rows (+ optional set_id/lang enrichment)
 * @param {Map}   valuationByInput  card_api_id -> portfolio_valuations row
 */
export function buildCollectionRows(positions = [], valuationByInput = new Map()) {
  return positions.map((p) => {
    const qty = Number(p.quantity) || 1;
    const graded = !!p.is_graded;
    const grade = graded ? parseGrade(p.grade_company, p.grade_value) : null;
    const v = valuationByInput.get(p.card_api_id) || null;
    // Graded slabs are never valued with a raw-card estimate (see valuation.js).
    const est = graded ? null : num(v?.estimated_value);
    const valued = est != null && est > 0;
    let reason = null;
    if (graded) reason = 'graded_not_covered';
    else if (!valued) reason = v?.unavailable_reason && v.unavailable_reason !== 'resolved_via_alias' ? v.unavailable_reason : 'no_data_yet';
    return {
      card_id: p.card_api_id ?? null,
      card_name: p.card_name ?? null,
      tcg: p.tcg ?? null,
      set_name: p.set_name ?? null,
      set_id: p.set_id ?? null,
      card_number: p.card_number ?? null,
      rarity: p.rarity ?? null,
      language: (p.language || p.lang || null),
      quantity: qty,
      condition: graded ? null : (p.condition ?? null),
      graded,
      grade_company: graded ? (grade?.company ?? p.grade_company ?? null) : null,
      grade_value: graded ? (grade?.value ?? p.grade_value ?? null) : null,
      grade_label: graded ? (gradeBadge(p) ?? null) : null,
      purchase_price: num(p.purchase_price),
      purchase_currency: p.purchase_price != null ? (p.fmv_currency || null) : null,
      purchase_date: p.purchase_date ?? null,
      est_value_eur_each: valued ? round2(est) : null,
      est_value_eur_total: valued ? round2(est * qty) : null,
      confidence: valued ? (v?.confidence ?? null) : null,
      n_observations: valued ? num(v?.n_observations) : null,
      n_sources: valued ? num(v?.n_sources) : null,
      observed_low_eur: valued ? round2(num(v?.observed_low)) : null,
      observed_high_eur: valued ? round2(num(v?.observed_high)) : null,
      valued_at: valued ? (v?.computed_at ?? null) : null,
      not_valued_reason: reason,
      added_at: p.added_at ?? null,
      notes: p.notes ?? null,
    };
  });
}

// Spreadsheet formula injection guard (OWASP "CSV Injection"): a text cell
// starting with = + - @ TAB or CR is prefixed with a single quote so Excel /
// Sheets / LibreOffice show it as text instead of evaluating it. Applied to
// strings only — numeric cells (incl. negative numbers) are emitted as is.
function safeText(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = safeText(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV (CRLF line endings, header row). Leading BOM so Excel reads UTF-8 (JA names). */
export function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** JSON envelope with explicit schema/version so the file is self-describing. */
export function toCollectionJson(rows, { exportedAt = new Date().toISOString() } = {}) {
  return JSON.stringify({
    format: 'dragold.collection',
    version: 1,
    exported_at: exportedAt,
    currency_of_estimates: 'EUR',
    estimate_method: 'DraGold market_valuations: median of recent market observations across sources; ' +
      'confidence reflects observation count and source agreement. Graded slabs are not valued with raw prices.',
    columns: COLLECTION_COLUMNS,
    count: rows.length,
    items: rows,
  }, null, 2);
}

export const WANT_LIST_COLUMNS = ['card_number', 'card_name', 'rarity', 'set_name', 'set_id', 'language', 'tcg', 'card_id'];

/** Missing cards of a set as flat rows (for a printable / shareable want list). */
export function buildWantListRows(missingCards = [], { setName = null } = {}) {
  return missingCards.map(c => ({
    card_number: c.card_number ?? null,
    card_name: c.name_en || c.name || null,
    rarity: c.rarity ?? null,
    set_name: c.set_name || setName || null,
    set_id: c.set_id ?? null,
    language: c.lang ?? null,
    tcg: c.tcg ?? null,
    card_id: c.id ?? null,
  }));
}

/** Filesystem-safe slug for download names. */
export function fileSlug(s) {
  return String(s || 'export').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'export';
}

/* ── browser-only ─────────────────────────────────────────────────────── */
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
