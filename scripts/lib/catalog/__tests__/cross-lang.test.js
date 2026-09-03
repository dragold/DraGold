import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normNum, numKey, resolveSetAlias, resolveNumberAlias, xlangKey, orderVersions } from '../cross-lang.js';

const SA = [
  { tcg: 'pokemon', alias_set_id: 'SV2a', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV2aCand', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'candidate' },
  { tcg: 'pokemon', alias_set_id: 'SV2aRej', canonical_set_id: 'sv03.5', relation: 'equivalent', confidence: 'rejected' },
  { tcg: 'pokemon', alias_set_id: 'SV1a', canonical_set_id: 'sv01', relation: 'partial', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SUBSET', canonical_set_id: 'sv02', relation: 'subset', confidence: 'confirmed' },
];
const NA = [
  { tcg: 'pokemon', alias_set_id: 'SV2a', alias_card_number: '193', canonical_set_id: 'sv03.5', canonical_card_number: '199', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV1a', alias_card_number: '010', canonical_set_id: 'sv01', canonical_card_number: '010', confidence: 'confirmed' },
  { tcg: 'pokemon', alias_set_id: 'SV2a', alias_card_number: '999', canonical_set_id: 'sv03.5', canonical_card_number: '250', confidence: 'candidate' },
];
const K = (t, s, n) => xlangKey(t, s, n, { setAliases: SA, numberAliases: NA });

test('1 — mapped JA set resolves to EN concept', () => {
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('2 — unmapped set stays raw (no false link)', () => {
  assert.equal(K('pokemon', 'XY9a', '006'), 'pokemon:xy9a:6');
  assert.notEqual(K('pokemon', 'XY9a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('3 — candidate set alias is inert', () => {
  assert.equal(K('pokemon', 'SV2aCand', '006'), 'pokemon:sv2acand:6');
});
test('4 — rejected set alias is inert', () => {
  assert.equal(K('pokemon', 'SV2aRej', '006'), 'pokemon:sv2arej:6');
});
test('5 — number exception maps set + number', () => {
  assert.equal(K('pokemon', 'SV2a', '193'), K('pokemon', 'sv03.5', '199'));
});
test('6 — candidate number alias is inert', () => {
  assert.equal(K('pokemon', 'SV2a', '999'), K('pokemon', 'sv03.5', '999'));  // set still remapped by equivalent set_alias, number stays raw
});
test('7 — set_identity_key spelling collapse without alias (sv3pt5 vs sv03.5)', () => {
  assert.equal(K('pokemon', 'sv3pt5', '199'), K('pokemon', 'sv03.5', '199'));
});
test('8 — One Piece: EN and JA share set_id, no alias needed', () => {
  assert.equal(K('onepiece', 'OP-01', 'OP01-001'), K('onepiece', 'OP-01', 'OP01-001'));
  // setIdentityKey collapses zero-padding after a letter: 'OP-01' -> 'op1'.
  // OP EN/JA already share canonical_card_id, so they link via same_canonical;
  // xlang_key only needs to be internally consistent for both rows (it is).
  assert.equal(K('onepiece', 'OP-01', 'OP01-001'), 'onepiece:op1:op01001');
});
test('9 — works without canonical (function does not read canonical)', () => {
  assert.equal(typeof K('pokemon', 'SV2a', '077'), 'string');
});
test('10 — alias applies to every language of the regional set', () => {
  // both ja and id rows of SV2a resolve identically (function is lang-agnostic)
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'sv03.5', '006'));
});
test('11 — idempotent', () => {
  assert.equal(K('pokemon', 'SV2a', '006'), K('pokemon', 'SV2a', '006'));
});
test('12 — cross-set number reuse does not collide (Base 006 vs Jungle 006)', () => {
  assert.notEqual(K('pokemon', 'base1', '006'), K('pokemon', 'jungle', '006'));
});
test('13 — alias target spelling variant still converges (JA + EN-tcgdex + EN-ptcg)', () => {
  const a = K('pokemon', 'SV2a', '006');       // -> sv03.5 -> sv35
  const b = K('pokemon', 'sv03.5', '006');     // -> sv35
  const c = K('pokemon', 'sv3pt5', '006');     // -> sv35
  assert.equal(a, b); assert.equal(b, c);
});
test('14 — relation=partial does NOT remap the set', () => {
  assert.equal(K('pokemon', 'SV1a', '020'), 'pokemon:sv1a:20');
  assert.notEqual(K('pokemon', 'SV1a', '020'), K('pokemon', 'sv01', '020'));
});
test('15 — number alias on a partial set DOES link that one card', () => {
  assert.equal(K('pokemon', 'SV1a', '010'), K('pokemon', 'sv01', '010'));
});
test('16 — relation=subset behaves like partial (no set remap)', () => {
  assert.equal(K('pokemon', 'SUBSET', '005'), 'pokemon:subset:5');
});
test('17 — number alias precedence over set alias', () => {
  // SV2a has an equivalent set_alias to sv03.5 AND a number alias 193->199.
  // The number-alias result must win: number becomes 199, set sv03.5.
  assert.equal(K('pokemon', 'SV2a', '193'), 'pokemon:sv35:199');
});

test('normNum strips separators and lowercases', () => {
  assert.equal(normNum('OP01-001'), 'op01001');
  assert.equal(normNum('006/165'), '006165');
  assert.equal(normNum('  6 '), '6');
  assert.equal(normNum(null), '');
});
test('numKey strips leading zero-padding, keeps internal digits', () => {
  assert.equal(numKey('006'), '6');
  assert.equal(numKey('020'), '20');
  assert.equal(numKey('OP01-001'), 'op01001');
  assert.equal(numKey('000'), '0');
  assert.equal(numKey('199'), '199');
});
test('resolveSetAlias: confirmed+equivalent only', () => {
  assert.equal(resolveSetAlias('pokemon', 'SV2a', SA), 'sv03.5');
  assert.equal(resolveSetAlias('pokemon', 'SV2aCand', SA), 'SV2aCand');
  assert.equal(resolveSetAlias('pokemon', 'SV1a', SA), 'SV1a');   // partial -> not remapped
  assert.equal(resolveSetAlias('pokemon', 'nope', SA), 'nope');
});
test('resolveNumberAlias: confirmed only, norm match', () => {
  assert.deepEqual(resolveNumberAlias('pokemon', 'SV2a', '193', NA), { canonical_set_id: 'sv03.5', canonical_card_number: '199' });
  assert.equal(resolveNumberAlias('pokemon', 'SV2a', '999', NA), null);  // candidate
  assert.equal(resolveNumberAlias('pokemon', 'SV2a', '006', NA), null);
});
test('orderVersions: contextLang, then en, ja, rest', () => {
  const rows = [{ lang: 'de' }, { lang: 'ja' }, { lang: 'en' }, { lang: 'it' }];
  assert.deepEqual(orderVersions(rows, 'it').map(r => r.lang), ['it', 'en', 'ja', 'de']);
  assert.deepEqual(orderVersions(rows, null).map(r => r.lang), ['en', 'ja', 'de', 'it']);
});
