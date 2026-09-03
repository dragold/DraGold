import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSeed, planUpserts } from '../apply-cross-language-aliases.mjs';

const good = {
  setAliases: [
    { tcg: 'pokemon', alias_set_id: 'SV2a', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'confirmed', source: 'bulbapedia', note: 'x'.repeat(12) },
  ],
  numberAliases: [
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '193', canonical_card_number: '199', confidence: 'confirmed', source: 'curated', note: 'x'.repeat(12) },
  ],
};

test('validateSeed: clean seed passes', () => {
  assert.equal(validateSeed(good.setAliases, good.numberAliases).ok, true);
});
test('validateSeed: set both alias and canonical -> fail', () => {
  const sa = [
    { tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'B', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
    { tcg: 'pokemon', alias_set_id: 'B', canonical_set_id: 'C', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
  ];
  const r = validateSeed(sa, []);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /both .*alias.*canonical|self-ref/i.test(e)));
});
test('validateSeed: confirmed without note -> fail', () => {
  const sa = [{ tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'B', relation: 'equivalent', confidence: 'confirmed', source: 's', note: '' }];
  assert.equal(validateSeed(sa, []).ok, false);
});
test('validateSeed: alias_set_id == canonical_set_id -> fail', () => {
  const sa = [{ tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'A', relation: 'equivalent', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) }];
  assert.equal(validateSeed(sa, []).ok, false);
});
test('validateSeed: number alias many-to-one -> fail', () => {
  const na = [
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '1', canonical_card_number: '9', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
    { tcg: 'pokemon', canonical_set_id: 'sv03.5', alias_set_id: 'SV2a', alias_card_number: '2', canonical_card_number: '9', confidence: 'confirmed', source: 's', note: 'x'.repeat(12) },
  ];
  assert.equal(validateSeed([], na).ok, false);
});
test('validateSeed: candidate row may omit note', () => {
  const sa = [{ tcg: 'pokemon', alias_set_id: 'A', canonical_set_id: 'B', relation: 'partial', confidence: 'candidate', source: 's', note: '' }];
  assert.equal(validateSeed(sa, []).ok, true);
});
test('planUpserts: idempotent — identical db rows -> 0 insert 0 update', () => {
  const seed = good.setAliases;
  const db = good.setAliases.map(r => ({ ...r }));
  const p = planUpserts(seed, db, ['tcg', 'alias_set_id']);
  assert.equal(p.insert.length, 0);
  assert.equal(p.update.length, 0);
  assert.equal(p.unchanged.length, 1);
});
test('planUpserts: changed note -> update', () => {
  const seed = [{ ...good.setAliases[0], note: 'y'.repeat(12) }];
  const db = [{ ...good.setAliases[0] }];
  const p = planUpserts(seed, db, ['tcg', 'alias_set_id']);
  assert.equal(p.update.length, 1);
});
test('planUpserts: new row -> insert', () => {
  const seed = [good.setAliases[0], { ...good.setAliases[0], alias_set_id: 'SV4a', canonical_set_id: 'sv04.5' }];
  const db = [{ ...good.setAliases[0] }];
  const p = planUpserts(seed, db, ['tcg', 'alias_set_id']);
  assert.equal(p.insert.length, 1);
  assert.equal(p.unchanged.length, 1);
});
