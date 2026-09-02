import test from 'node:test';
import assert from 'node:assert/strict';
import { tcgdexSetToLogoRow, tcgcsvGroupToLogoRow, statusFor } from '../set-logo-rows.js';

const TODAY = new Date('2026-09-02T00:00:00Z');

test('statusFor', () => {
  assert.equal(statusFor('2026-07-17', TODAY), 'released');
  assert.equal(statusFor('2026-11-20', TODAY), 'upcoming');
  assert.equal(statusFor(null, TODAY), 'announced');
});

test('tcgdexSetToLogoRow: released + confidence high', () => {
  const r = tcgdexSetToLogoRow({
    code: 'me05', name: 'Pitch Black', releaseDate: '2026-07-17',
    cardCountOfficial: 84, logo: 'L', symbol: 'S', serieId: 'me', serieName: 'Mega Evolution',
  }, TODAY);
  assert.equal(r.set_code, 'me05');
  assert.equal(r.tcg, 'pokemon');
  assert.equal(r.status, 'released');
  assert.equal(r.released_on, '2026-07-17');
  assert.equal(r.card_count, 84);
  assert.equal(r.series_id, 'me');
  assert.equal(r.source, 'tcgdex');
  assert.equal(r.source_confidence, 'high');
});

test('tcgdexSetToLogoRow: senza data -> announced / medium', () => {
  const r = tcgdexSetToLogoRow({ code: 'sv11', name: 'Future', releaseDate: null }, TODAY);
  assert.equal(r.status, 'announced');
  assert.equal(r.source_confidence, 'medium');
});

test('tcgcsvGroupToLogoRow: OP-17 released', () => {
  const r = tcgcsvGroupToLogoRow({ setCode: 'OP-17', groupName: "The World's Strongest Warriors", publishedOn: '2026-08-28', entityType: 'set' }, TODAY);
  assert.equal(r.set_code, 'OP-17');
  assert.equal(r.tcg, 'onepiece');
  assert.equal(r.status, 'released');
  assert.equal(r.released_on, '2026-08-28');
  assert.equal(r.source_confidence, 'high');
  assert.equal(r.logo_url, null);
});

test('tcgcsvGroupToLogoRow: OP-18 upcoming', () => {
  const r = tcgcsvGroupToLogoRow({ setCode: 'OP-18', groupName: 'The Dominance of God', publishedOn: '2026-11-20', entityType: 'set' }, TODAY);
  assert.equal(r.status, 'upcoming');
});

test('tcgcsvGroupToLogoRow: bucket a suffisso alfabetico -> null (no set proprio)', () => {
  assert.equal(tcgcsvGroupToLogoRow({ setCode: 'OP-PR', groupName: 'One Piece Promotion Cards', publishedOn: '2022-09-30' }, TODAY), null);
});
