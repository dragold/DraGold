import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FK_ENFORCED_TABLES,
  REFERENCE_ONLY_TABLES,
  buildDependencyMap,
  summarizeDependencies,
  annotateFindingsWithDependencies,
} from '../dependency-check.js';

test('FK_ENFORCED_TABLES e REFERENCE_ONLY_TABLES non si sovrappongono', () => {
  const overlap = FK_ENFORCED_TABLES.filter(t => REFERENCE_ONLY_TABLES.includes(t));
  assert.equal(overlap.length, 0);
});

test('buildDependencyMap: unisce mappe per-tabella in una mappa per-card', () => {
  const map = buildDependencyMap({
    card_prices: { 'card-1': 3 },
    hot_picks: { 'card-1': 1 },
    alerts: { 'card-2': 5 },
  });
  assert.equal(map['card-1'].card_prices, 3);
  assert.equal(map['card-1'].hot_picks, 1);
  assert.equal(map['card-2'].alerts, 5);
});

test('summarizeDependencies: distingue FK-enforced da reference-only', () => {
  const map = buildDependencyMap({
    card_prices: { 'card-1': 3 },
    alerts: { 'card-1': 2 },
  });
  const summary = summarizeDependencies(['card-1'], map);
  assert.equal(summary.fkEnforcedTotal, 3);
  assert.equal(summary.referenceOnlyTotal, 2);
  assert.equal(summary.hasAnyDependency, true);
  assert.equal(summary.hasFkEnforcedDependency, true);
});

test('summarizeDependencies: card senza dipendenze → tutti zero', () => {
  const summary = summarizeDependencies(['card-x'], {});
  assert.equal(summary.hasAnyDependency, false);
  assert.equal(summary.hasFkEnforcedDependency, false);
});

test('summarizeDependencies: aggrega su più card contemporaneamente', () => {
  const map = buildDependencyMap({ card_prices: { a: 2, b: 5 } });
  const summary = summarizeDependencies(['a', 'b'], map);
  assert.equal(summary.byTable.card_prices, 7);
  assert.equal(summary.byCard.a.card_prices, 2);
  assert.equal(summary.byCard.b.card_prices, 5);
});

test('annotateFindingsWithDependencies: non muta i findings originali', () => {
  const findings = [{ finding: 'EXACT_DUPLICATE', row_ids: ['a'] }];
  const map = buildDependencyMap({ card_prices: { a: 1 } });
  const annotated = annotateFindingsWithDependencies(findings, map);
  assert.equal(findings[0].dependencies, undefined, 'oggetto originale non deve essere mutato');
  assert.equal(annotated[0].dependencies.fkEnforcedTotal, 1);
});

test('annotateFindingsWithDependencies: gestisce findings senza row_ids senza errore', () => {
  const findings = [{ finding: 'MISSING' }];
  assert.doesNotThrow(() => annotateFindingsWithDependencies(findings, {}));
});
