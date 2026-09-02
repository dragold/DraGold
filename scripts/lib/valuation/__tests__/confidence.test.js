import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConfidence } from '../confidence.js';

const NOW = new Date('2026-09-02T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test('0 osservazioni -> none', () => {
  const r = computeConfidence({ observations: [], now: NOW });
  assert.equal(r.band, 'none');
  assert.equal(r.score, 0);
});

test('3 fonti, 10 obs recenti, spread stretto -> high', () => {
  const obs = [];
  for (let i = 0; i < 10; i++) {
    obs.push({ price_eur: 100 + (i % 3), observed_at: daysAgo(i % 5), source: ['tcgcsv', 'cardmarket', 'ebay_browse'][i % 3] });
  }
  const r = computeConfidence({ observations: obs, now: NOW });
  assert.equal(r.band, 'high');
  assert.ok(r.score >= 0.85, `score ${r.score}`);
  assert.equal(r.reason.sources.n, 3);
  assert.equal(r.reason.observations.n, 10);
});

test('1 fonte, 2 obs vecchie, spread ampio -> low o none', () => {
  const r = computeConfidence({
    observations: [
      { price_eur: 50, observed_at: daysAgo(45), source: 'tcgcsv' },
      { price_eur: 120, observed_at: daysAgo(60), source: 'tcgcsv' },
    ],
    now: NOW,
  });
  assert.ok(r.band === 'low' || r.band === 'none', `band ${r.band}`);
  assert.ok(r.score < 0.42);
});

test('1 fonte (TCGCSV) sola, molte obs recenti concordi -> medium (non high)', () => {
  const obs = [];
  for (let i = 0; i < 12; i++) obs.push({ price_eur: 30, observed_at: daysAgo(i % 4), source: 'tcgcsv' });
  const r = computeConfidence({ observations: obs, now: NOW });
  assert.equal(r.band, 'medium'); // sources score cap a 1/3 -> non basta per high
  assert.equal(r.reason.sources.n, 1);
});

test('reason contiene il breakdown completo', () => {
  const r = computeConfidence({ observations: [{ price_eur: 10, observed_at: daysAgo(1), source: 'tcgcsv' }], now: NOW });
  assert.ok('sources' in r.reason && 'observations' in r.reason && 'recency' in r.reason && 'agreement' in r.reason);
  assert.equal(typeof r.reason.recency.newest_days, 'number');
});
