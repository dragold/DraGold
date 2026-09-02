import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEntityType } from '../classify-entity.js';
import { diffSets } from '../reconcile-sets.js';
import { diffSetCards } from '../reconcile-cards.js';

test('classifyEntityType: set principali One Piece', () => {
  assert.equal(classifyEntityType({ tcg: 'onepiece', setCode: 'OP-17', groupName: "The World's Strongest Warriors" }), 'set');
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'EB05', groupName: "Heroine's Edition Vol. 2" }), 'set');
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'PRB02' }), 'set');
});

test('classifyEntityType: promo / release event', () => {
  assert.equal(classifyEntityType({ tcg: 'onepiece', setCode: 'P' }), 'promo');
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'OP17 RE', groupName: "The World's Strongest Warriors Release Event Cards" }), 'promo');
  assert.equal(classifyEntityType({ tcg: 'pokemon', groupName: 'SWSH Black Star Promos' }), 'promo');
  assert.equal(classifyEntityType({ tcg: 'onepiece', groupName: '1st Anniversary Tournament Cards' }), 'promo');
});

test('classifyEntityType: starter/deck -> product', () => {
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'ST28', groupName: 'Yamato Starter Deck' }), 'product');
  assert.equal(classifyEntityType({ tcg: 'onepiece', groupName: 'Set Sail Deck Set', abbreviation: 'SD01' }), 'product');
});

test('classifyEntityType: supplemental non classificato altrove -> special', () => {
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'XX', groupName: 'Weird Box Topper', isSupplemental: true }), 'special');
});

test('diffSets: OP-17 mancante, OP-16 matched', () => {
  const r = diffSets({
    upstreamSets: [
      { code: 'OP-17', name: "The World's Strongest Warriors", source: 'tcgcsv' },
      { code: 'OP-16', name: 'X', source: 'tcgcsv' },
    ],
    dbSetCodesNorm: new Set(['op16', 'op15']),
  });
  assert.deepEqual(r.missing.map((s) => s.code), ['OP-17']);
  assert.deepEqual(r.matched.map((s) => s.code), ['OP-16']);
  assert.deepEqual(r.extra.sort(), ['op15']);
});

test('diffSets: OP-01 vs op01 collassano (nessun falso missing)', () => {
  const r = diffSets({
    upstreamSets: [{ code: 'OP-01', source: 'tcgcsv' }],
    dbSetCodesNorm: new Set(['op01']),
  });
  assert.equal(r.missing.length, 0);
  assert.equal(r.matched.length, 1);
});

test('diffSetCards: differenza insiemistica ordinata', () => {
  const r = diffSetCards({
    setCode: 'OP-17',
    upstreamNumbers: new Set(['op17001', 'op17002', 'op17003']),
    dbNumbers: new Set(['op17001']),
  });
  assert.deepEqual(r.missingNumbers, ['op17002', 'op17003']);
  assert.deepEqual(r.extraNumbers, []);
});
