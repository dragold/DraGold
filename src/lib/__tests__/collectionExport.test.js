import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCollectionRows,
  toCsv,
  toCollectionJson,
  buildWantListRows,
  fileSlug,
} from '../collectionExport.js';

test('buildCollectionRows formats raw and graded rows properly', () => {
  const positions = [
    {
      card_api_id: 'pkm-1',
      card_name: 'Charizard',
      tcg: 'pokemon',
      set_name: 'Base Set',
      quantity: 1,
      is_graded: false,
      condition: 'NM',
      purchase_price: 150,
      fmv_currency: 'EUR',
    },
    {
      card_api_id: 'pkm-2',
      card_name: 'Pikachu',
      tcg: 'pokemon',
      quantity: 2,
      is_graded: true,
      grade_company: 'PSA',
      grade_value: '10',
    },
  ];

  const valuationByInput = new Map([
    ['pkm-1', { estimated_value: 200, confidence: 'high', n_observations: 12, n_sources: 3, observed_low: 180, observed_high: 220, computed_at: '2026-11-01' }],
    ['pkm-2', { estimated_value: 50, confidence: 'medium' }], // Raw price should NOT be assigned to graded slab
  ]);

  const rows = buildCollectionRows(positions, valuationByInput);
  assert.equal(rows.length, 2);

  // Raw card
  assert.equal(rows[0].card_name, 'Charizard');
  assert.equal(rows[0].condition, 'NM');
  assert.equal(rows[0].est_value_eur_each, 200);
  assert.equal(rows[0].est_value_eur_total, 200);
  assert.equal(rows[0].confidence, 'high');
  assert.equal(rows[0].n_observations, 12);
  assert.equal(rows[0].not_valued_reason, null);

  // Graded card: no raw value applied
  assert.equal(rows[1].graded, true);
  assert.equal(rows[1].grade_company, 'PSA');
  assert.equal(rows[1].grade_value, '10');
  assert.equal(rows[1].grade_label, 'PSA 10');
  assert.equal(rows[1].est_value_eur_each, null);
  assert.equal(rows[1].not_valued_reason, 'graded_not_covered');
});

test('toCsv produces RFC 4180 CSV with formula protection and UTF-8 BOM', () => {
  const rows = [
    { name: 'Normal Card', formula: '=cmd|"/C calc"!A0', price: 10.5 },
    { name: 'Card with "quotes" and, commas', formula: '+SUM(1,2)', price: 20 },
  ];

  const csv = toCsv(rows, ['name', 'formula', 'price']);
  assert.ok(csv.startsWith('\uFEFF')); // UTF-8 BOM for Excel
  assert.ok(csv.includes('"Card with ""quotes"" and, commas"'));
  // Formulas guarded with leading quote
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.includes("'+SUM"));
});

test('toCollectionJson produces valid structured JSON', () => {
  const rows = [{ card_id: 'c1', card_name: 'Luffy' }];
  const jsonStr = toCollectionJson(rows, { exportedAt: '2026-11-05T00:00:00Z' });
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.format, 'dragold.collection');
  assert.equal(parsed.version, 1);
  assert.equal(parsed.count, 1);
  assert.deepEqual(parsed.items, rows);
});

test('buildWantListRows and fileSlug work correctly', () => {
  const missing = [{ id: 'op-1', name: 'Zoro', card_number: 'OP01-001', rarity: 'SR' }];
  const rows = buildWantListRows(missing, { setName: 'Romance Dawn' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].card_name, 'Zoro');
  assert.equal(rows[0].set_name, 'Romance Dawn');

  assert.equal(fileSlug('Romance Dawn: OP-01!'), 'romance-dawn-op-01');
});
