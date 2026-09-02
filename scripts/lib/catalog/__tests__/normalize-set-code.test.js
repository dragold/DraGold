import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSetCode, canonicalOnePieceSetId } from '../normalize-set-code.js';

test('normalizeSetCode: lowercase + strip non-alfanumerici', () => {
  assert.equal(normalizeSetCode('OP-17'), 'op17');
  assert.equal(normalizeSetCode('sv10.5b'), 'sv105b');
  assert.equal(normalizeSetCode('SV10'), 'sv10');
  assert.equal(normalizeSetCode('sv10'), 'sv10');
  assert.equal(normalizeSetCode('  OP 01  '), 'op01');
});

test('normalizeSetCode: input degeneri non lanciano', () => {
  assert.equal(normalizeSetCode(''), '');
  assert.equal(normalizeSetCode(null), '');
  assert.equal(normalizeSetCode(undefined), '');
  assert.equal(normalizeSetCode(123), '123');
});

test('normalizeSetCode: OP-01 e op01 collassano sulla stessa chiave', () => {
  assert.equal(normalizeSetCode('OP-01'), normalizeSetCode('op01'));
});

test('canonicalOnePieceSetId: prefissi noti -> dashed uppercase, numero a 2 cifre', () => {
  assert.equal(canonicalOnePieceSetId('OP17'), 'OP-17');
  assert.equal(canonicalOnePieceSetId('op-17'), 'OP-17');
  assert.equal(canonicalOnePieceSetId('OP 17'), 'OP-17');
  assert.equal(canonicalOnePieceSetId('EB5'), 'EB-05');
  assert.equal(canonicalOnePieceSetId('EB-05'), 'EB-05');
  assert.equal(canonicalOnePieceSetId('PRB2'), 'PRB-02');
  assert.equal(canonicalOnePieceSetId('ST36'), 'ST-36');
});

test('canonicalOnePieceSetId: promo bucket', () => {
  assert.equal(canonicalOnePieceSetId('P'), 'P');
  assert.equal(canonicalOnePieceSetId('promo'), 'P');
  assert.equal(canonicalOnePieceSetId('P-1'), 'P');
});

test('canonicalOnePieceSetId: etichette TCGCSV combinate -> primo token strutturato', () => {
  assert.equal(canonicalOnePieceSetId('OP15-EB04'), 'OP-15');
  assert.equal(canonicalOnePieceSetId('EB-03-04'), 'EB-03');
  assert.equal(canonicalOnePieceSetId('OP17 RE'), 'OP-17');
});

test('canonicalOnePieceSetId: bucket a suffisso alfabetico invariati', () => {
  assert.equal(canonicalOnePieceSetId('OP-PR'), 'OP-PR');
  assert.equal(canonicalOnePieceSetId('OP-DD'), 'OP-DD');
});

test('canonicalOnePieceSetId: valori non riconosciuti restano invariati (upper/trim)', () => {
  assert.equal(canonicalOnePieceSetId('OTHER'), 'OTHER');
  assert.equal(canonicalOnePieceSetId('  weird  '), 'WEIRD');
  assert.equal(canonicalOnePieceSetId(''), '');
  assert.equal(canonicalOnePieceSetId(null), '');
});
