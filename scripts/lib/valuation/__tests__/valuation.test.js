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

test('confidence_reason sempre presente quando ci sono osservazioni', () => {
  const v = computeValuation({ cardId: 'c6', tcg: 'onepiece', observations: [{ kind: 'market', source: 'tcgcsv', price_eur: 10, observed_at: daysAgo(1) }], now: NOW });
  assert.ok(v.confidence_reason);
  assert.equal(typeof v.confidence_score, 'number');
});
