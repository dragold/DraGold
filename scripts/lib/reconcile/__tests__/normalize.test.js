import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCardNumber as normalizeTcgdexCardNumber, normalizeTcgdexRow, normalizeTcgdexRows } from '../normalize-tcgdex.js';
import { normalizeCardNumber as normalizePtcgCardNumber, normalizePtcgRow, normalizePtcgRows } from '../normalize-ptcg.js';

// Le due implementazioni condividono la stessa regola conservativa (vedi
// commento in normalize-ptcg.js sul perché sono duplicate invece che
// condivise) — testate entrambe per garantire che restino allineate.
const IMPLEMENTATIONS = [
  ['normalize-tcgdex', normalizeTcgdexCardNumber],
  ['normalize-ptcg', normalizePtcgCardNumber],
];

for (const [name, normalizeCardNumber] of IMPLEMENTATIONS) {
  test(`${name}: stringa puramente numerica con zeri iniziali viene spogliata`, () => {
    const result = normalizeCardNumber('044');
    assert.equal(result.normalized, '44');
    assert.equal(result.wasNormalized, true);
    assert.equal(result.reason, 'LEADING_ZEROS_STRIPPED');
  });

  test(`${name}: stringa puramente numerica già senza zeri resta invariata`, () => {
    const result = normalizeCardNumber('44');
    assert.equal(result.normalized, '44');
    assert.equal(result.wasNormalized, false);
    assert.equal(result.reason, 'ALREADY_NORMAL_FORM');
  });

  test(`${name}: "0" resta "0" (nessuna cifra dopo lo zero da rimuovere)`, () => {
    const result = normalizeCardNumber('0');
    assert.equal(result.normalized, '0');
    assert.equal(result.wasNormalized, false);
  });

  test(`${name}: valore alfanumerico non viene mai trasformato`, () => {
    const result = normalizeCardNumber('SWSH001');
    assert.equal(result.normalized, 'SWSH001');
    assert.equal(result.wasNormalized, false);
    assert.equal(result.reason, 'NON_NUMERIC_NOT_NORMALIZED');
  });

  test(`${name}: null → NULL_INPUT, mai un errore`, () => {
    const result = normalizeCardNumber(null);
    assert.equal(result.normalized, null);
    assert.equal(result.reason, 'NULL_INPUT');
  });

  test(`${name}: stringa vuota → EMPTY_INPUT`, () => {
    const result = normalizeCardNumber('');
    assert.equal(result.normalized, '');
    assert.equal(result.reason, 'EMPTY_INPUT');
  });

  test(`${name}: numero passato come number JS viene gestito`, () => {
    const result = normalizeCardNumber(44);
    assert.equal(result.normalized, '44');
  });
}

test('normalizeTcgdexRow: non muta la riga originale', () => {
  const row = { id: 'x', tcg: 'pokemon', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: 'A', name: 'Charmander' };
  const frozen = JSON.parse(JSON.stringify(row));
  const normalized = normalizeTcgdexRow(row);
  assert.deepEqual(row, frozen);
  assert.equal(normalized.source, 'tcgdex');
  assert.equal(normalized.card_number_raw, '044');
  assert.equal(normalized.card_number_normalized, '44');
  assert.equal(normalized._raw, row);
});

test('normalizePtcgRow: card_number già unpadded, wasNormalized=false', () => {
  const row = { id: 'y', tcg: 'pokemon', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'B', name: 'Charmander' };
  const normalized = normalizePtcgRow(row);
  assert.equal(normalized.source, 'ptcg');
  assert.equal(normalized.card_number_normalized, '44');
  assert.equal(normalized.card_number_was_normalized, false);
});

test('normalizeTcgdexRow: lancia su input non-oggetto', () => {
  assert.throws(() => normalizeTcgdexRow(null), TypeError);
  assert.throws(() => normalizePtcgRow(undefined), TypeError);
});

test('normalizeTcgdexRows / normalizePtcgRows: ignorano righe null/undefined nell\'array', () => {
  const rows = [{ id: '1', card_number: '1' }, null, undefined, { id: '2', card_number: '02' }];
  assert.equal(normalizeTcgdexRows(rows).length, 2);
  assert.equal(normalizePtcgRows(rows).length, 2);
});

test('caso reale svp-044 vs svp-44: la normalizzazione produce lo stesso valore, il canonical_card_id resta diverso', () => {
  const tcgdexRow = normalizeTcgdexRow({ id: 'pokemon:tcgdex:svp-044:en', tcg: 'pokemon', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: '34e65567-97b9-4007-98ea-b94ccd82e75e', name: 'Charmander' });
  const ptcgRow = normalizePtcgRow({ id: 'pokemon:ptcg:svp-44', tcg: 'pokemon', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'e05713fc-0790-4034-a2c5-f31092004918', name: 'Charmander' });

  assert.equal(tcgdexRow.card_number_normalized, ptcgRow.card_number_normalized, 'la natural key deve coincidere dopo normalizzazione');
  assert.notEqual(tcgdexRow.canonical_card_id, ptcgRow.canonical_card_id, 'il canonical_card_id resta frammentato: la normalizzazione non lo corregge da sola');
});
