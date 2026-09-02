import test from 'node:test';
import assert from 'node:assert/strict';
import { computeValuation } from '../valuation.js';

const NOW = new Date('2026-09-02T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test('12 obs market EUR, 3 fonti, spread stretto -> high, valore ~mediana', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) {
    obs.push({ kind: 'market', source: ['tcgcsv', 'cardmarket', 'ebay_browse'][i % 3], sub_type: 'Normal', price_eur: 180 + (i % 3) * 2, observed_at: daysAgo(i % 10) });
  }
  const v = computeValuation({ cardId: 'c1', tcg: 'onepiece', observations: obs, now: NOW });
  assert.equal(v.confidence, 'high');
  assert.ok(v.estimated_value >= 180 && v.estimated_value <= 186, `val ${v.estimated_value}`);
  assert.ok(v.observed_low <= v.observed_median && v.observed_median <= v.observed_high);
  assert.equal(v.n_sources, 3);
  assert.ok(v.sources.includes('cardmarket'));
});

test('solo listing -> estimated = mediana * 0.92, confidence <= low', () => {
  const obs = [
    { kind: 'listing', source: 'ebay_browse', price_eur: 100, observed_at: daysAgo(1) },
    { kind: 'listing', source: 'ebay_browse', price_eur: 110, observed_at: daysAgo(2) },
  ];
  const v = computeValuation({ cardId: 'c2', tcg: 'onepiece', observations: obs, now: NOW });
  // dedupe per (source,subtype) -> resta 1 sola (la piu' recente, 100) -> * 0.92
  assert.equal(v.estimated_value, 92);
  assert.ok(['low', 'none'].includes(v.confidence));
});

test('0 osservazioni valide -> null / none', () => {
  const v = computeValuation({ cardId: 'c3', tcg: 'pokemon', observations: [{ kind: 'market', source: 'x', price_eur: 5, observed_at: daysAgo(200) }], now: NOW });
  assert.equal(v.estimated_value, null);
  assert.equal(v.confidence, 'none');
  assert.equal(v.n_observations, 0);
});

test('trend 7d: settimana -2 a 15, settimana -1 a 18 -> +20%', () => {
  const obs = [
    { kind: 'market', source: 'a', price_eur: 15, observed_at: daysAgo(12) },
    { kind: 'market', source: 'b', price_eur: 15, observed_at: daysAgo(11) },
    { kind: 'market', source: 'a', price_eur: 18, observed_at: daysAgo(3) },
    { kind: 'market', source: 'b', price_eur: 18, observed_at: daysAgo(2) },
  ];
  const v = computeValuation({ cardId: 'c4', tcg: 'onepiece', observations: obs, now: NOW });
  assert.equal(v.trend_7d_pct, 20);
});

test('una fonte con 40 righe non domina (dedupe per fonte/subtype)', () => {
  const obs = [];
  for (let i = 0; i < 40; i++) obs.push({ kind: 'market', source: 'tcgcsv', sub_type: 'Normal', price_eur: 5, observed_at: daysAgo(i % 3) });
  for (let i = 0; i < 3; i++) obs.push({ kind: 'market', source: 'cardmarket', sub_type: 'Normal', price_eur: 100, observed_at: daysAgo(i) });
  const v = computeValuation({ cardId: 'c5', tcg: 'onepiece', observations: obs, now: NOW });
  // pool deduplicato = 1 voto tcgcsv (5) + 1 voto cardmarket (100): l'high
  // riflette cardmarket, non e' schiacciato dai 40 record tcgcsv.
  assert.equal(v.n_sources, 2);
  assert.ok(v.observed_high >= 90, `high ${v.observed_high}`); // riflette cardmarket@100
  assert.ok(v.estimated_value >= 5 && v.estimated_value <= 100);
  // confidence 'observations' basata su bucket (fonte,giorno), non su 43 righe
  assert.ok(v.confidence_reason.observations.buckets <= 6);
});

test('F2: osservazione placeholder TCGplayer (low==mid==high, valore alto) esclusa', () => {
  const obs = [
    { kind: 'market', source: 'tcgcsv', sub_type: 'Foil', price: 25, price_eur: 22, observed_at: daysAgo(1), raw: { low: 21, mid: 30, high: 70 } },
    { kind: 'market', source: 'tcgcsv', sub_type: 'Foil', price: 29994.99, price_eur: 25900, observed_at: daysAgo(1), raw: { low: 29994.99, mid: 29994.99, high: 29994.99 } },
  ];
  const v = computeValuation({ cardId: 'ph', tcg: 'onepiece', observations: obs, now: NOW });
  assert.ok(v.estimated_value < 100, `il placeholder da 26k non deve entrare: ${v.estimated_value}`);
  assert.equal(v.observed_high < 100, true);
});

test('F3: observed_low/high riflettono la dispersione reale, non collassano a un punto', () => {
  const obs = [
    { kind: 'market', source: 'tcgcsv', sub_type: 'Foil', price_eur: 40, observed_at: daysAgo(1) },
    { kind: 'market', source: 'cardmarket', sub_type: 'Foil', price_eur: 700, observed_at: daysAgo(1) },
  ];
  const v = computeValuation({ cardId: 'sp', tcg: 'onepiece', observations: obs, now: NOW });
  assert.ok(v.observed_low < v.observed_high, `range non deve essere a larghezza 0: [${v.observed_low}, ${v.observed_high}]`);
  assert.ok(v.observed_low >= 40 && v.observed_high <= 700);
});

test('F4: Normal e Holofoil non vengono mescolati — vince il sub_type con piu\' osservazioni', () => {
  const obs = [
    { kind: 'market', source: 'tcgcsv', sub_type: 'Normal', price_eur: 1, observed_at: daysAgo(1) },
    { kind: 'market', source: 'tcgcsv', sub_type: 'Normal', price_eur: 1.1, observed_at: daysAgo(2) },
    { kind: 'market', source: 'tcgcsv', sub_type: 'Normal', price_eur: 0.9, observed_at: daysAgo(3) },
    { kind: 'market', source: 'tcgcsv', sub_type: 'Holofoil', price_eur: 15, observed_at: daysAgo(1) },
  ];
  const v = computeValuation({ cardId: 'ft', tcg: 'pokemon', observations: obs, now: NOW });
  // Normal ha 3 giorni di osservazioni, Holofoil 1 -> primario = Normal, ~1 EUR (non ~8)
  assert.ok(v.estimated_value < 3, `deve valere il Normal, non il blend: ${v.estimated_value}`);
});

test('valore alto senza corroborazione (1 obs, 1 fonte) -> confidence cap low', () => {
  const v = computeValuation({
    cardId: 'chase', tcg: 'onepiece',
    observations: [{ kind: 'market', source: 'tcgcsv', sub_type: 'Foil', price_eur: 6908, observed_at: daysAgo(0) }],
    now: NOW,
  });
  assert.equal(v.confidence, 'low');
  assert.match(JSON.stringify(v.confidence_reason), /corroborazione/);
});

test('valore basso con 1 obs resta medium (il cap e\' solo per valori alti)', () => {
  const v = computeValuation({
    cardId: 'common', tcg: 'onepiece',
    observations: [{ kind: 'market', source: 'tcgcsv', sub_type: 'Foil', price_eur: 12, observed_at: daysAgo(0) }],
    now: NOW,
  });
  assert.equal(v.confidence, 'medium');
});

test('confidence_reason sempre presente quando ci sono osservazioni', () => {
  const v = computeValuation({ cardId: 'c6', tcg: 'onepiece', observations: [{ kind: 'market', source: 'tcgcsv', price_eur: 10, observed_at: daysAgo(1) }], now: NOW });
  assert.ok(v.confidence_reason);
  assert.equal(typeof v.confidence_score, 'number');
});
