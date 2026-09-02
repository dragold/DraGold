import test from 'node:test';
import assert from 'node:assert/strict';
import { pokemonCardKey, onepieceCardKey, cardNumberKey } from '../card-number-key.js';

test('pokemonCardKey: strip zeri iniziali sui numerici puri (TCGdex "001" -> DB "1")', () => {
  assert.equal(pokemonCardKey('001'), '1');
  assert.equal(pokemonCardKey('010'), '10');
  assert.equal(pokemonCardKey('100'), '100');
  assert.equal(pokemonCardKey('1'), '1');
});

test('pokemonCardKey: alfanumerici invariati', () => {
  assert.equal(pokemonCardKey('TG01'), 'TG01');
  assert.equal(pokemonCardKey('SWSH001'), 'SWSH001');
  assert.equal(pokemonCardKey(''), '');
  assert.equal(pokemonCardKey(null), '');
});

test('onepieceCardKey: "OP17-020" -> "op17020" (allineato a cards.card_number_norm)', () => {
  assert.equal(onepieceCardKey('OP17-020'), 'op17020');
  assert.equal(onepieceCardKey('OP16-001'), 'op16001');
  assert.equal(onepieceCardKey(''), '');
});

test('cardNumberKey: dispatch per tcg', () => {
  assert.equal(cardNumberKey('onepiece', 'OP17-020'), 'op17020');
  assert.equal(cardNumberKey('pokemon', '007'), '7');
});
