import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPricePulseSeries, MIN_OBSERVATIONS_FOR_CHART } from './pricePulse.pure.js';

test('PricePulse: returns no_history for empty or null observations', () => {
  const resNull = buildPricePulseSeries(null);
  assert.equal(resNull.hasSufficientData, false);
  assert.equal(resNull.reason, 'no_history');
  assert.deepEqual(resNull.points, []);

  const resEmpty = buildPricePulseSeries([]);
  assert.equal(resEmpty.hasSufficientData, false);
  assert.equal(resEmpty.reason, 'no_history');
});

test('PricePulse: discards invalid, zero, or negative prices cleanly without crash', () => {
  const badData = [
    { price_eur: 0, observed_at: '2026-09-01T10:00:00Z' },
    { price_eur: -5.5, observed_at: '2026-09-02T10:00:00Z' },
    { price_eur: null, price: null, observed_at: '2026-09-03T10:00:00Z' },
    { price_eur: NaN, observed_at: '2026-09-04T10:00:00Z' },
    null,
    undefined,
  ];
  const res = buildPricePulseSeries(badData);
  assert.equal(res.hasSufficientData, false);
  assert.equal(res.reason, 'no_valid_prices');
  assert.deepEqual(res.points, []);
});

test('PricePulse: identifies insufficient series (< 5 points)', () => {
  const shortSeries = [
    { price_eur: 10.0, observed_at: '2026-09-01T10:00:00Z' },
    { price_eur: 10.5, observed_at: '2026-09-02T10:00:00Z' },
    { price_eur: 11.0, observed_at: '2026-09-03T10:00:00Z' },
  ];
  const res = buildPricePulseSeries(shortSeries, { minPoints: 5 });
  assert.equal(res.hasSufficientData, false);
  assert.equal(res.reason, 'insufficient_series');
  assert.equal(res.count, 3);
  assert.equal(res.minRequired, 5);
  // points are still returned if needed for diagnostic, but hasSufficientData is false
  assert.equal(res.points.length, 3);
});

test('PricePulse: deduplicates multiple observations on the same day keeping the latest', () => {
  const duplicateDays = [
    { price_eur: 5.0, observed_at: '2026-09-01T08:00:00Z' },
    { price_eur: 5.2, observed_at: '2026-09-01T16:00:00Z' }, // latest on 2026-09-01
    { price_eur: 5.5, observed_at: '2026-09-02T10:00:00Z' },
    { price_eur: 5.8, observed_at: '2026-09-03T10:00:00Z' },
    { price_eur: 6.0, observed_at: '2026-09-04T10:00:00Z' },
    { price_eur: 6.2, observed_at: '2026-09-05T10:00:00Z' },
  ];
  const res = buildPricePulseSeries(duplicateDays, { minPoints: 5 });
  assert.equal(res.hasSufficientData, true);
  assert.equal(res.points.length, 5); // 5 distinct days
  const day1 = res.points.find((p) => p.dateKey === '2026-09-01');
  assert.equal(day1.price, 5.2); // kept the 16:00 one
});

test('PricePulse: handles currency conversion correctly for EUR and USD targets', () => {
  const obs = [
    { price: 11.58, currency: 'USD', price_eur: 10.0, fx_rate: 1.1578, observed_at: '2026-09-01T10:00:00Z' },
    { price: 11.58, currency: 'USD', price_eur: 10.0, fx_rate: 1.1578, observed_at: '2026-09-02T10:00:00Z' },
    { price: 12.00, currency: 'USD', price_eur: 10.36, fx_rate: 1.1578, observed_at: '2026-09-03T10:00:00Z' },
    { price: 12.50, currency: 'USD', price_eur: 10.8, fx_rate: 1.1578, observed_at: '2026-09-04T10:00:00Z' },
    { price: 13.00, currency: 'USD', price_eur: 11.23, fx_rate: 1.1578, observed_at: '2026-09-05T10:00:00Z' },
  ];

  // Target EUR
  const resEur = buildPricePulseSeries(obs, { targetCurrency: 'EUR', minPoints: 5 });
  assert.equal(resEur.hasSufficientData, true);
  assert.equal(resEur.points[0].currency, 'EUR');
  assert.equal(resEur.points[0].price, 10.0);
  assert.equal(resEur.summary.firstPrice, 10.0);
  assert.equal(resEur.summary.lastPrice, 11.23);
  assert.equal(resEur.summary.changePct, 12.3);

  // Target USD
  const resUsd = buildPricePulseSeries(obs, { targetCurrency: 'USD', minPoints: 5 });
  assert.equal(resUsd.hasSufficientData, true);
  assert.equal(resUsd.points[0].currency, 'USD');
  assert.equal(resUsd.points[0].price, 11.58);
  assert.equal(resUsd.summary.firstPrice, 11.58);
  assert.equal(resUsd.summary.lastPrice, 13.0);
});

test('PricePulse: preserves min/max band when logically valid and nullifies when contradictory', () => {
  const data = [
    // Valid band: low <= price <= high
    {
      price: 10,
      price_eur: 10,
      currency: 'EUR',
      observed_at: '2026-09-01T10:00:00Z',
      raw: { low: 8, high: 12 },
    },
    // Contradictory band: low > price -> band should be null
    {
      price: 10,
      price_eur: 10,
      currency: 'EUR',
      observed_at: '2026-09-02T10:00:00Z',
      raw: { low: 15, high: 20 },
    },
    // Missing raw
    {
      price: 11,
      price_eur: 11,
      currency: 'EUR',
      observed_at: '2026-09-03T10:00:00Z',
    },
    {
      price: 11.5,
      price_eur: 11.5,
      currency: 'EUR',
      observed_at: '2026-09-04T10:00:00Z',
      raw: { low: 9, high: 14 },
    },
    {
      price: 12,
      price_eur: 12,
      currency: 'EUR',
      observed_at: '2026-09-05T10:00:00Z',
      raw: { low: 10, high: 15 },
    },
  ];

  const res = buildPricePulseSeries(data, { minPoints: 5 });
  assert.equal(res.hasSufficientData, true);
  // Point 0 has valid band
  assert.equal(res.points[0].low, 8);
  assert.equal(res.points[0].high, 12);
  // Point 1 has contradictory band -> low/high set to null
  assert.equal(res.points[1].low, null);
  assert.equal(res.points[1].high, null);
  // Point 2 has missing raw -> low/high set to null
  assert.equal(res.points[2].low, null);
  assert.equal(res.points[2].high, null);
});

test('PricePulse: isolates primary subtype to prevent blending disparate finishes', () => {
  // Mixed data: 5 days of Normal (~1€) and 5 days of Holofoil (~15€)
  const mixed = [
    { price_eur: 1.0, sub_type: 'Normal', observed_at: '2026-09-01T10:00:00Z' },
    { price_eur: 15.0, sub_type: 'Holofoil', observed_at: '2026-09-01T10:00:00Z' },
    { price_eur: 1.05, sub_type: 'Normal', observed_at: '2026-09-02T10:00:00Z' },
    { price_eur: 15.2, sub_type: 'Holofoil', observed_at: '2026-09-02T10:00:00Z' },
    { price_eur: 1.1, sub_type: 'Normal', observed_at: '2026-09-03T10:00:00Z' },
    { price_eur: 15.5, sub_type: 'Holofoil', observed_at: '2026-09-03T10:00:00Z' },
    { price_eur: 1.15, sub_type: 'Normal', observed_at: '2026-09-04T10:00:00Z' },
    { price_eur: 15.8, sub_type: 'Holofoil', observed_at: '2026-09-04T10:00:00Z' },
    { price_eur: 1.2, sub_type: 'Normal', observed_at: '2026-09-05T10:00:00Z' },
    { price_eur: 16.0, sub_type: 'Holofoil', observed_at: '2026-09-05T10:00:00Z' },
  ];

  const res = buildPricePulseSeries(mixed, { minPoints: 5 });
  assert.equal(res.hasSufficientData, true);
  assert.equal(res.points.length, 5);
  // Normal finish should be chosen by preference ranking over Holofoil when days are tied
  assert.equal(res.points[0].subType, 'Normal');
  assert.equal(res.points[0].price, 1.0);
  assert.equal(res.points[4].price, 1.2);
  assert.equal(res.summary.firstPrice, 1.0);
  assert.equal(res.summary.lastPrice, 1.2);
});
