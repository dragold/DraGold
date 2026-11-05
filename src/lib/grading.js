// DraGold — Grading scales (Collection Layer: graded slabs).
// Pure module, no I/O, no React.
//
// Clean-room: built from the public grading scales each company publishes
// on its own site (PSA, Beckett, CGC, SGC, TAG, ACE). No third-party app
// code or data tables were copied. The live `collection` table already has
// is_graded / grade_company / grade_value (text) columns (verified via a
// read-only query on 2026-11-05) — this module only decides which values are
// valid and how to label them; it does not introduce new schema.
//
// Storage contract for collection.grade_value (text):
//   "<number>"               e.g. "10", "9.5", "7"
//   "<number> <qualifier>"   only where a company issues two different 10s,
//                            e.g. "10 Pristine", "10 Black Label".
// Human-readable on purpose: CSV exports and any future consumer read it as is.

const halfSteps = (from, to) => {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += 0.5) out.push(Number(v.toFixed(1)));
  return out;
};
const intSteps = (from, to) => {
  const out = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
};

// Grade descriptors per company. `values` are the numeric grades a company
// issues; `tens` lists the distinct 10-level labels (first = plain "10").
export const GRADING_COMPANIES = [
  {
    id: 'PSA', label: 'PSA',
    // PSA issues half grades from 1.5 to 8.5, no 9.5.
    values: [1, ...halfSteps(1.5, 8.5), 9, 10].filter((v, i, a) => a.indexOf(v) === i),
    tens: [{ value: '10', label: 'GEM MT 10', tier: 'GEM_MINT_10' }],
    names: { 10: 'Gem Mint', 9: 'Mint', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX', 4: 'VG-EX', 3: 'VG', 2: 'Good', 1.5: 'Fair', 1: 'Poor' },
  },
  {
    id: 'BGS', label: 'Beckett (BGS)',
    values: halfSteps(1, 10),
    tens: [
      { value: '10 Pristine', label: 'Pristine 10', tier: 'PRISTINE_10' },
      { value: '10 Black Label', label: 'Black Label 10', tier: 'BLACK_LABEL_10' },
    ],
    names: { 9.5: 'Gem Mint', 9: 'Mint', 8.5: 'NM-MT+', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX', 4: 'VG-EX', 3: 'VG', 2: 'Good', 1: 'Poor' },
  },
  {
    id: 'CGC', label: 'CGC',
    values: halfSteps(1, 10),
    tens: [
      { value: '10', label: 'Gem Mint 10', tier: 'GEM_MINT_10' },
      { value: '10 Pristine', label: 'Pristine 10', tier: 'PRISTINE_10' },
    ],
    names: { 9.5: 'Mint+', 9: 'Mint', 8.5: 'NM/Mint+', 8: 'NM/Mint', 7: 'Near Mint', 6: 'Ex/NM', 5: 'Excellent', 4: 'VG/Ex', 3: 'Very Good', 2: 'Good', 1: 'Poor' },
  },
  {
    id: 'SGC', label: 'SGC',
    values: halfSteps(1, 10),
    tens: [
      { value: '10', label: 'Gem Mint 10', tier: 'GEM_MINT_10' },
      { value: '10 Pristine', label: 'Pristine 10', tier: 'PRISTINE_10' },
    ],
    names: { 9.5: 'Mint+', 9: 'Mint', 8.5: 'NM-MT+', 8: 'NM-MT', 7: 'NM', 6: 'EX-NM', 5: 'EX', 4: 'VG-EX', 3: 'VG', 2: 'Good', 1: 'Poor' },
  },
  {
    id: 'TAG', label: 'TAG',
    values: halfSteps(1, 10),
    tens: [
      { value: '10', label: 'Gem Mint 10', tier: 'GEM_MINT_10' },
      { value: '10 Pristine', label: 'Pristine 10', tier: 'PRISTINE_10' },
    ],
    names: { 9.5: 'Mint+', 9: 'Mint', 8.5: 'NM-MT+', 8: 'NM-MT' },
  },
  {
    id: 'ACE', label: 'ACE',
    values: intSteps(1, 10),
    tens: [{ value: '10', label: 'Gem Mint 10', tier: 'GEM_MINT_10' }],
    names: { 9: 'Mint', 8: 'NM-MT', 7: 'NM' },
  },
];

const BY_ID = new Map(GRADING_COMPANIES.map(c => [c.id, c]));

// Aliases users (or older rows: schema.sql comment says "PSA, CGC, Beckett")
// may have stored. Normalized to the canonical company id.
const COMPANY_ALIASES = { BECKETT: 'BGS', BVG: 'BGS', 'BECKETT (BGS)': 'BGS' };

/** @returns {string|null} canonical company id, or null if unknown */
export function normalizeCompany(raw) {
  const k = String(raw || '').trim().toUpperCase();
  if (!k) return null;
  if (BY_ID.has(k)) return k;
  return COMPANY_ALIASES[k] || null;
}

/** Selectable grade options for a company, highest first: [{ value, label }] */
export function gradeOptions(companyId) {
  const c = BY_ID.get(normalizeCompany(companyId));
  if (!c) return [];
  const opts = [];
  for (const t of [...c.tens].reverse()) opts.push({ value: t.value, label: t.label });
  for (const v of [...c.values].reverse()) {
    if (v === 10) continue; // covered by `tens`
    const name = c.names[v];
    opts.push({ value: String(v), label: name ? `${v} · ${name}` : String(v) });
  }
  return opts;
}

/**
 * Parses + validates a stored grade.
 * @returns {{ company, value, numeric, label, short, tier } | null}
 *   null when company/value are missing or not a grade that company issues.
 */
export function parseGrade(companyRaw, valueRaw) {
  const company = normalizeCompany(companyRaw);
  const c = company && BY_ID.get(company);
  if (!c) return null;
  const value = String(valueRaw ?? '').trim().replace(/\s+/g, ' ');
  if (!value) return null;

  const ten = c.tens.find(t => t.value.toLowerCase() === value.toLowerCase());
  if (ten) {
    return { company, value: ten.value, numeric: 10, label: ten.label, short: `${company} ${ten.value}`, tier: ten.tier };
  }
  if (!/^\d+(\.5|\.0)?$/.test(value)) return null;
  const numeric = Number(value);
  if (numeric === 10 || !c.values.includes(numeric)) return null;
  const name = c.names[numeric];
  return {
    company, value: String(numeric), numeric,
    label: name ? `${name} ${numeric}` : String(numeric),
    short: `${company} ${numeric}`,
    tier: String(numeric),
  };
}

// Cross-company ladder: lets two slabs from different companies be compared
// on one axis (e.g. "PSA 10" and "CGC Gem Mint 10" sit on the same rung,
// "CGC Pristine 10" sits above). Order = rank.
export const GRADE_TIERS = [
  ...halfSteps(1, 9.5).map(v => ({ id: String(v), label: String(v) })),
  { id: 'GEM_MINT_10', label: 'Gem Mint 10' },
  { id: 'PRISTINE_10', label: 'Pristine 10' },
  { id: 'BLACK_LABEL_10', label: 'Black Label 10' },
];
const TIER_RANK = new Map(GRADE_TIERS.map((t, i) => [t.id, i]));

/** Comparable rank for sorting slabs across companies; -1 when not graded/invalid. */
export function gradeRank(companyRaw, valueRaw) {
  const g = parseGrade(companyRaw, valueRaw);
  return g ? (TIER_RANK.get(g.tier) ?? -1) : -1;
}

/** Short display string for a collection row, e.g. "PSA 10" — null if not graded/invalid. */
export function gradeBadge(pos) {
  if (!pos?.is_graded) return null;
  return parseGrade(pos.grade_company, pos.grade_value)?.short || null;
}
