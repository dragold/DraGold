import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idsForCard,
  ownedQty,
  ownedRowId,
  computeSetProgress,
  filterByOwnership,
} from '../setChecklist.js';

test('idsForCard accounts for deduped variantEntries', () => {
  const cardWithVariants = {
    id: 'pokemon:tcgdex:base3-1:en',
    variantEntries: [
      { id: 'pokemon:tcgdex:base3-1:en' },
      { id: 'pokemon:ptcg:base3-1' },
    ],
  };
  const ids = idsForCard(cardWithVariants);
  assert.deepEqual(ids.sort(), ['pokemon:ptcg:base3-1', 'pokemon:tcgdex:base3-1:en']);

  const plainCard = { id: 'card-1' };
  assert.deepEqual(idsForCard(plainCard), ['card-1']);
});

test('ownedQty and ownedRowId correctly detect ownership across variants', () => {
  const card = {
    id: 'rep-id',
    variantEntries: [{ id: 'alt-id' }],
  };

  const qtyMap = new Map([
    ['alt-id', 2],
  ]);

  assert.equal(ownedQty(card, qtyMap), 2);
  assert.equal(ownedRowId(card, qtyMap), 'alt-id');

  const unownedCard = { id: 'rep-2' };
  assert.equal(ownedQty(unownedCard, qtyMap), 0);
  assert.equal(ownedRowId(unownedCard, qtyMap), 'rep-2');
});

test('computeSetProgress computes statistics correctly', () => {
  const cards = [
    { id: 'c1' },
    { id: 'c2' },
    { id: 'c3' },
    { id: 'c4' },
  ];
  const qtyMap = new Map([
    ['c1', 1],
    ['c3', 3],
  ]);

  const progress = computeSetProgress(cards, qtyMap);
  assert.equal(progress.total, 4);
  assert.equal(progress.owned, 2);
  assert.equal(progress.missing, 2);
  assert.equal(progress.pct, 50);
});

test('filterByOwnership filters cards as expected', () => {
  const cards = [{ id: 'c1' }, { id: 'c2' }];
  const qtyMap = new Map([['c1', 1]]);

  assert.equal(filterByOwnership(cards, qtyMap, 'all').length, 2);
  assert.deepEqual(filterByOwnership(cards, qtyMap, 'owned'), [{ id: 'c1' }]);
  assert.deepEqual(filterByOwnership(cards, qtyMap, 'missing'), [{ id: 'c2' }]);
});
