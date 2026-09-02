import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveInsights } from '../insights.js';
import { explainUnavailable, groupUnvalued } from '../unavailableReason.js';
import { buildValueHistory } from '../history.js';

test('deriveInsights: concentrazione presente solo con >=3 posizioni', () => {
  const few = deriveInsights({ pricedCount: 2, unvaluedCount: 0, totalEur: 10, byTcg: [{ tcg: 'onepiece' }], bySet: [], movers: [], concentration: { top1Pct: 90, top5Pct: 100, top10Pct: 100, topPositions: [] } });
  assert.equal(few.some((i) => i.kind === 'concentration'), false);
  const many = deriveInsights({ pricedCount: 12, unvaluedCount: 0, totalEur: 100, byTcg: [{ tcg: 'onepiece' }, { tcg: 'pokemon' }], bySet: [], movers: [], concentration: { top1Pct: 20, top5Pct: 50, top10Pct: 74, topPositions: [] } });
  assert.equal(many.some((i) => i.kind === 'concentration'), true);
});

test('deriveInsights: niente insight "mover" se movers vuoto', () => {
  const r = deriveInsights({ pricedCount: 5, unvaluedCount: 0, totalEur: 50, byTcg: [{ tcg: 'onepiece' }], bySet: [], movers: [], concentration: { top1Pct: 10, top10Pct: 20, topPositions: [] } });
  assert.equal(r.some((i) => i.kind === 'mover'), false);
});

test('deriveInsights: single_tcg', () => {
  const r = deriveInsights({ pricedCount: 5, unvaluedCount: 0, totalEur: 50, byTcg: [{ tcg: 'pokemon' }], bySet: [], movers: [], concentration: { top1Pct: 10, top10Pct: 20, topPositions: [] } });
  assert.equal(r.some((i) => i.kind === 'single_tcg' && /Pokémon/.test(i.text)), true);
});

test('explainUnavailable + groupUnvalued', () => {
  assert.match(explainUnavailable('ja_not_covered').text, /Japanese/);
  assert.equal(explainUnavailable('boh').title, explainUnavailable('no_data_yet').title);
  const g = groupUnvalued([
    { card_api_id: 'a', reason: 'ja_not_covered' },
    { card_api_id: 'b', reason: 'ja_not_covered' },
    { card_api_id: 'c', reason: 'no_data_yet' },
    { card_api_id: 'd', reason: 'resolved_via_alias' }, // ignorato
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].reason, 'ja_not_covered');
  assert.equal(g[0].cardIds.length, 2);
});

test('buildValueHistory: building vs ok', () => {
  const positions = [{ card_api_id: 'x', quantity: 2 }];
  const two = buildValueHistory({ positions, historyRows: [
    { as_of: '2026-09-01', card_id: 'x', unit_eur: 5 },
    { as_of: '2026-09-02', card_id: 'x', unit_eur: 6 },
  ] });
  assert.equal(two.state, 'building');
  assert.equal(two.series[0].valueEur, 10);
  const five = buildValueHistory({ positions, historyRows: [1, 2, 3, 4, 5].map((d) => ({ as_of: `2026-09-0${d}`, card_id: 'x', unit_eur: d })) });
  assert.equal(five.state, 'ok');
});

test('buildValueHistory: usa resolvedByInput per mappare la quantity', () => {
  const positions = [{ card_api_id: 'ptcg:me2pt5-1', quantity: 3 }];
  const resolvedByInput = new Map([['ptcg:me2pt5-1', 'tcgdex:me02.5-1']]);
  const r = buildValueHistory({ positions, resolvedByInput, historyRows: [{ as_of: '2026-09-02', card_id: 'tcgdex:me02.5-1', unit_eur: 4 }] });
  assert.equal(r.series[0].valueEur, 12);
});
