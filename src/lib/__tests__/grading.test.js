import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GRADING_COMPANIES,
  normalizeCompany,
  gradeOptions,
  parseGrade,
  gradeRank,
  gradeBadge,
} from '../grading.js';

test('normalizeCompany handles standard and alias names', () => {
  assert.equal(normalizeCompany('psa'), 'PSA');
  assert.equal(normalizeCompany('PSA'), 'PSA');
  assert.equal(normalizeCompany('bgs'), 'BGS');
  assert.equal(normalizeCompany('beckett'), 'BGS');
  assert.equal(normalizeCompany('Beckett (BGS)'), 'BGS');
  assert.equal(normalizeCompany('cgc'), 'CGC');
  assert.equal(normalizeCompany('sgc'), 'SGC');
  assert.equal(normalizeCompany('tag'), 'TAG');
  assert.equal(normalizeCompany('ace'), 'ACE');
  assert.equal(normalizeCompany('unknown_corp'), null);
  assert.equal(normalizeCompany(''), null);
});

test('gradeOptions returns company options ordered highest first', () => {
  const psaOpts = gradeOptions('PSA');
  assert.ok(psaOpts.length > 5);
  assert.equal(psaOpts[0].value, '10');
  assert.equal(psaOpts[0].label, 'GEM MT 10');

  const bgsOpts = gradeOptions('BGS');
  assert.equal(bgsOpts[0].value, '10 Black Label');
  assert.equal(bgsOpts[1].value, '10 Pristine');
});

test('parseGrade parses valid and rejects invalid grades', () => {
  const p10 = parseGrade('PSA', '10');
  assert.notEqual(p10, null);
  assert.equal(p10.company, 'PSA');
  assert.equal(p10.value, '10');
  assert.equal(p10.short, 'PSA 10');
  assert.equal(p10.tier, 'GEM_MINT_10');

  const bgsBlack = parseGrade('Beckett', '10 Black Label');
  assert.notEqual(bgsBlack, null);
  assert.equal(bgsBlack.company, 'BGS');
  assert.equal(bgsBlack.tier, 'BLACK_LABEL_10');
  assert.equal(bgsBlack.short, 'BGS 10 Black Label');

  const bgs95 = parseGrade('BGS', '9.5');
  assert.notEqual(bgs95, null);
  assert.equal(bgs95.numeric, 9.5);
  assert.equal(bgs95.short, 'BGS 9.5');

  // PSA does not have a 9.5 grade
  assert.equal(parseGrade('PSA', '9.5'), null);
  // Invalid string
  assert.equal(parseGrade('PSA', 'invalid'), null);
});

test('gradeRank and gradeBadge work correctly', () => {
  const rankPsa10 = gradeRank('PSA', '10');
  const rankBgsPristine = gradeRank('BGS', '10 Pristine');
  const rankBgsBlack = gradeRank('BGS', '10 Black Label');
  const rankBgs95 = gradeRank('BGS', '9.5');

  assert.ok(rankBgsBlack > rankBgsPristine);
  assert.ok(rankBgsPristine > rankPsa10);
  assert.ok(rankPsa10 > rankBgs95);

  assert.equal(gradeBadge({ is_graded: true, grade_company: 'PSA', grade_value: '10' }), 'PSA 10');
  assert.equal(gradeBadge({ is_graded: false }), null);
  assert.equal(gradeBadge(null), null);
});
