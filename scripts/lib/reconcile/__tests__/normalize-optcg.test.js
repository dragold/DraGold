import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCardNumber, normalizeOptcgRow, normalizeOptcgRows } from '../normalize-optcg.js';

// Stessa regola conservativa condivisa con normalize-tcgdex.js/normalize-ptcg.js
// (vedi commento in normalize-optcg.js sul perché è duplicata invece che
// condivisa) — le assert di base restano identiche a quelle in normalize.test.js
// per garantire che le tre implementazioni non divergano silenziosamente.

test('normalizeCardNumber: stringa puramente numerica con zeri iniziali viene spogliata', () => {
  const result = normalizeCardNumber('044');
  assert.equal(result.normalized, '44');
  assert.equal(result.wasNormalized, true);
  assert.equal(result.reason, 'LEADING_ZEROS_STRIPPED');
});

test('normalizeCardNumber: stringa puramente numerica già senza zeri resta invariata', () => {
  const result = normalizeCardNumber('44');
  assert.equal(result.normalized, '44');
  assert.equal(result.wasNormalized, false);
  assert.equal(result.reason, 'ALREADY_NORMAL_FORM');
});

test('normalizeCardNumber: null → NULL_INPUT, mai un errore', () => {
  const result = normalizeCardNumber(null);
  assert.equal(result.normalized, null);
  assert.equal(result.reason, 'NULL_INPUT');
});

test('normalizeCardNumber: stringa vuota → EMPTY_INPUT', () => {
  const result = normalizeCardNumber('');
  assert.equal(result.normalized, '');
  assert.equal(result.reason, 'EMPTY_INPUT');
});

// --- Forma reale One Piece (verificato in scripts/sync-cards.js#syncOnePiece):
// card_number e source_id sono la STESSA stringa "<set_code>-<numero>", mai un
// numero puro isolato dal set code come per Pokémon. La regola "solo cifre
// pure" non deve MAI scattare su questi valori reali.

test('normalizeCardNumber: "OP01-001" (formato reale One Piece) non viene mai trasformato', () => {
  const result = normalizeCardNumber('OP01-001');
  assert.equal(result.normalized, 'OP01-001');
  assert.equal(result.wasNormalized, false);
  assert.equal(result.reason, 'NON_NUMERIC_NOT_NORMALIZED');
});

test('normalizeCardNumber: "ST01-001" (starter deck) non viene mai trasformato', () => {
  const result = normalizeCardNumber('ST01-001');
  assert.equal(result.normalized, 'ST01-001');
  assert.equal(result.wasNormalized, false);
});

test('normalizeCardNumber: "P-001" (promo) non viene mai trasformato', () => {
  const result = normalizeCardNumber('P-001');
  assert.equal(result.normalized, 'P-001');
  assert.equal(result.wasNormalized, false);
});

test('normalizeOptcgRow: non muta la riga originale, source forzato a "optcg"', () => {
  const row = {
    id: 'onepiece:optcg:OP01-001:en',
    tcg: 'onepiece',
    source_id: 'OP01-001',
    set_id: 'OP-01',
    lang: 'en',
    card_number: 'OP01-001',
    canonical_card_id: null,
    name: 'Roronoa Zoro (001)',
    image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png',
  };
  const frozen = JSON.parse(JSON.stringify(row));
  const normalized = normalizeOptcgRow(row);
  assert.deepEqual(row, frozen, 'la riga originale non deve essere mutata');
  assert.equal(normalized.source, 'optcg');
  assert.equal(normalized.card_number_raw, 'OP01-001');
  assert.equal(normalized.card_number_normalized, 'OP01-001');
  assert.equal(normalized.card_number_was_normalized, false);
  assert.equal(normalized._raw, row);
  assert.equal(normalized.set_id, 'OP-01');
});

test('normalizeOptcgRow: lancia su input non-oggetto', () => {
  assert.throws(() => normalizeOptcgRow(null), TypeError);
  assert.throws(() => normalizeOptcgRow(undefined), TypeError);
  assert.throws(() => normalizeOptcgRow('OP01-001'), TypeError);
});

test('normalizeOptcgRow: campi mancanti diventano null, mai undefined o valori inventati', () => {
  const normalized = normalizeOptcgRow({ id: 'onepiece:optcg:OP01-001:en' });
  assert.equal(normalized.tcg, null);
  assert.equal(normalized.set_id, null);
  assert.equal(normalized.lang, null);
  assert.equal(normalized.canonical_card_id, null);
  assert.equal(normalized.name, null);
  assert.equal(normalized.image_url, null);
  assert.equal(normalized.image_url_hi, null);
  assert.equal(normalized.rarity, null);
});

test('normalizeOptcgRows: ignora righe null/undefined nell\'array', () => {
  const rows = [
    { id: '1', card_number: 'OP01-001' },
    null,
    undefined,
    { id: '2', card_number: 'ST01-001' },
  ];
  const result = normalizeOptcgRows(rows);
  assert.equal(result.length, 2);
  assert.ok(result.every(r => r.source === 'optcg'));
});

test('normalizeOptcgRows: array vuoto/undefined non lancia', () => {
  assert.deepEqual(normalizeOptcgRows([]), []);
  assert.deepEqual(normalizeOptcgRows(undefined), []);
});
