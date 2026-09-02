import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEntityType } from '../classify-entity.js';
import { diffSets } from '../reconcile-sets.js';
import { diffSetCards } from '../reconcile-cards.js';
import { mapOnePieceGroups } from '../onepiece-groups.js';
import { normalizeSetCode } from '../normalize-set-code.js';

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

test('classifyEntityType: One Piece non-strutturato -> promo (mai "set mancante")', () => {
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'OP-PR', groupName: 'One Piece Promotion Cards' }), 'promo');
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'OP-DD', groupName: 'One Piece Demo Deck Cards' }), 'product');
  assert.equal(classifyEntityType({ tcg: 'onepiece', abbreviation: 'XX', groupName: 'Weird Box Topper', isSupplemental: true }), 'promo');
});

test('classifyEntityType: Pokémon supplemental -> special', () => {
  assert.equal(classifyEntityType({ tcg: 'pokemon', groupName: 'Trick or Trade BOOster Bundle', isSupplemental: true }), 'special');
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

test('scoperta del prossimo set ignoto: un OP-19 futuro upstream diventa gap senza modifiche al codice', () => {
  // Simula la lista group TCGCSV del futuro: identica a oggi + un OP-19 non
  // ancora esistente. Nessun ramo di codice nuovo: mapOnePieceGroups + diffSets
  // lo trattano come qualunque altro set.
  const futureGroups = [
    { groupId: 1, name: "The World's Strongest Warriors", abbreviation: 'OP17', isSupplemental: false, publishedOn: '2026-08-28T00:00:00' },
    { groupId: 2, name: 'A Set That Does Not Exist Yet', abbreviation: 'OP19', isSupplemental: false, publishedOn: '2027-02-01T00:00:00' },
  ];
  const mapped = mapOnePieceGroups(futureGroups);
  const op19 = mapped.find((m) => m.setCode === 'OP-19');
  assert.ok(op19, 'OP-19 mappato');
  assert.equal(op19.entityType, 'set');

  const { missing } = diffSets({
    upstreamSets: mapped.map((m) => ({ code: m.setCode, name: m.groupName, releaseDate: m.publishedOn })),
    dbSetCodesNorm: new Set(['op17']), // DB ha solo OP-17
  });
  assert.deepEqual(missing.map((s) => s.code), ['OP-19']);
});
