import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioValuation } from '../valuation.js';

const pos = (over) => ({ id: over.card_api_id, card_name: over.card_api_id, tcg: 'onepiece', set_name: 'S', language: 'en', quantity: 1, ...over });

test('totali e conteggi: 2 valutate + 2 non valutate', () => {
  const positions = [
    pos({ card_api_id: 'a', quantity: 2 }),
    pos({ card_api_id: 'b' }),
    pos({ card_api_id: 'c', language: 'ja' }),
    pos({ card_api_id: 'd' }),
  ];
  const valuations = [
    { input_card_id: 'a', estimated_value: 10, confidence: 'medium' },
    { input_card_id: 'b', estimated_value: 5, confidence: 'medium' },
    { input_card_id: 'c', estimated_value: null, confidence: 'none', unavailable_reason: 'ja_not_covered' },
    { input_card_id: 'd', estimated_value: null, confidence: 'none', unavailable_reason: 'no_data_yet' },
  ];
  const p = buildPortfolioValuation({ positions, valuations });
  assert.equal(p.totalEur, 25);            // 10*2 + 5
  assert.equal(p.pricedCount, 2);
  assert.equal(p.unvaluedCount, 2);
  assert.equal(p.confidenceMix.medium.count, 2);
  assert.equal(p.confidenceMix.none.count, 2);
  assert.equal(p.concentration.top1Pct, 80); // 20/25
  assert.deepEqual(p.unvalued.map((u) => u.reason).sort(), ['ja_not_covered', 'no_data_yet']);
});

test('breakdown per tcg/lang', () => {
  const positions = [
    pos({ card_api_id: 'a', tcg: 'onepiece', language: 'en' }),
    pos({ card_api_id: 'b', tcg: 'pokemon', language: 'en' }),
  ];
  const valuations = [
    { input_card_id: 'a', estimated_value: 30, confidence: 'medium' },
    { input_card_id: 'b', estimated_value: 10, confidence: 'medium' },
  ];
  const p = buildPortfolioValuation({ positions, valuations });
  assert.equal(p.byTcg[0].tcg, 'onepiece');
  assert.equal(p.byTcg[0].pct, 75);
  assert.equal(p.byLang[0].lang, 'EN');
});

test('movers: solo trend non-null, ordinati per |trend|', () => {
  const positions = [pos({ card_api_id: 'a' }), pos({ card_api_id: 'b' }), pos({ card_api_id: 'c' })];
  const valuations = [
    { input_card_id: 'a', estimated_value: 1, confidence: 'medium', trend_7d_pct: 5 },
    { input_card_id: 'b', estimated_value: 1, confidence: 'medium', trend_30d_pct: -20 },
    { input_card_id: 'c', estimated_value: 1, confidence: 'medium' }, // niente trend
  ];
  const p = buildPortfolioValuation({ positions, valuations });
  assert.equal(p.movers.length, 2);
  assert.equal(p.movers[0].card_api_id, 'b');
  assert.equal(p.movers[0].window, '30d');
});

test('portfolio interamente non valutato: nessun NaN, tutto vuoto', () => {
  const positions = [pos({ card_api_id: 'a' }), pos({ card_api_id: 'b' })];
  const valuations = [
    { input_card_id: 'a', estimated_value: null, confidence: 'none', unavailable_reason: 'ja_not_covered' },
    { input_card_id: 'b', estimated_value: null, confidence: 'none', unavailable_reason: 'set_not_covered' },
  ];
  const p = buildPortfolioValuation({ positions, valuations });
  assert.equal(p.totalEur, 0);
  assert.deepEqual(p.movers, []);
  assert.deepEqual(p.mostValuable, []);
  assert.equal(p.unvalued.length, 2);
  assert.equal(p.concentration.top1Pct, 0);
  assert.equal(p.byTcg.length, 0);
});

test('confidence low separata da medium', () => {
  const positions = [pos({ card_api_id: 'a' }), pos({ card_api_id: 'b' })];
  const valuations = [
    { input_card_id: 'a', estimated_value: 100, confidence: 'medium' },
    { input_card_id: 'b', estimated_value: 6900, confidence: 'low' },
  ];
  const p = buildPortfolioValuation({ positions, valuations });
  assert.equal(p.confidenceMix.low.count, 1);
  assert.equal(p.confidenceMix.medium.count, 1);
  assert.equal(p.mostValuable[0].confidence, 'low');
});
