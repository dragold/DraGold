import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripPokemonGroupPrefix, tcgcsvNumberToLocalId, cardNumberNorm,
  resolvePokemonSetId, buildPokemonSetIndex, pickCardId, resolveCardIdFromIndex,
} from '../card-match.js';

test('stripPokemonGroupPrefix', () => {
  assert.equal(stripPokemonGroupPrefix('SV: Prismatic Evolutions'), 'Prismatic Evolutions');
  assert.equal(stripPokemonGroupPrefix('ME06: Delta Reign'), 'Delta Reign');
  assert.equal(stripPokemonGroupPrefix('SWSH12: Silver Tempest'), 'Silver Tempest');
  assert.equal(stripPokemonGroupPrefix('Prismatic Evolutions'), 'Prismatic Evolutions');
});

test('tcgcsvNumberToLocalId', () => {
  assert.equal(tcgcsvNumberToLocalId('001/131'), '001');
  assert.equal(tcgcsvNumberToLocalId('TG12/TG30'), 'TG12');
  assert.equal(tcgcsvNumberToLocalId('SWSH284'), 'SWSH284');
  assert.equal(tcgcsvNumberToLocalId('GG01/GG70'), 'GG01');
  assert.equal(tcgcsvNumberToLocalId(''), null);
});

test('cardNumberNorm allineato a card_number_norm', () => {
  assert.equal(cardNumberNorm('001'), '001');
  assert.equal(cardNumberNorm('TG12'), 'tg12');
  assert.equal(cardNumberNorm('OP17-020'), 'op17020');
});

test('resolvePokemonSetId: unambiguo / non trovato / ambiguo', () => {
  const idx = new Map([
    ['prismatic evolutions', { setId: 'sv8pt5', ambiguous: false }],
    ['chaos rising', { setId: null, ambiguous: true }],
  ]);
  assert.deepEqual(resolvePokemonSetId(idx, 'SV: Prismatic Evolutions'), { setId: 'sv8pt5', reason: 'ok' });
  assert.deepEqual(resolvePokemonSetId(idx, 'ME04: Chaos Rising'), { setId: null, reason: 'set-name-ambiguous' });
  assert.deepEqual(resolvePokemonSetId(idx, 'SV: Nonexistent'), { setId: null, reason: 'set-name-not-in-db' });
});

test('pickCardId / resolveCardIdFromIndex: preferisci base, ambiguo -> null', () => {
  assert.equal(pickCardId([{ id: 'a', print_variant: null }]), 'a');
  assert.equal(pickCardId([{ id: 'a', print_variant: null }, { id: 'b', print_variant: 'parallel' }]), 'a');
  assert.equal(pickCardId([{ id: 'a', print_variant: 'parallel' }, { id: 'b', print_variant: 'manga' }]), null);
  assert.equal(pickCardId([]), null);
  const idx = new Map([['op17020', [{ id: 'x', print_variant: null }]]]);
  assert.equal(resolveCardIdFromIndex(idx, 'op17020'), 'x');
  assert.equal(resolveCardIdFromIndex(idx, 'nope'), null);
});

test('buildPokemonSetIndex: risolve ambiguita\' via lista autoritativa', async () => {
  const pages = [[
    { set_id: 'me1', set_name: 'Mega Evolution' },
    { set_id: 'me01', set_name: 'Mega Evolution' },
    { set_id: 'sv8pt5', set_name: 'Prismatic Evolutions' },
  ]];
  let call = 0;
  const sb = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ order: () => ({ range: () => Promise.resolve({ data: pages[call++] || [], error: null }) }) }) }) }) }) }) };
  const idx = await buildPokemonSetIndex(sb, new Set(['me01', 'sv8pt5']));
  assert.deepEqual(idx.get('mega evolution'), { setId: 'me01', ambiguous: false });
  assert.deepEqual(idx.get('prismatic evolutions'), { setId: 'sv8pt5', ambiguous: false });
});
