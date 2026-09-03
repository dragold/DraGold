// Cross-Language Identity (Fase A) — RPC integration tests. Runs against the live
// project (read-only, plus one insert/delete of a throwaway candidate alias in R9).
//   set -a && source .env.local && set +a && node --test scripts/__tests__/card-versions-rpc.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { xlangKey } from '../lib/catalog/cross-lang.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const MARKET_COLS = ['estimated_value', 'observed_low', 'observed_median', 'observed_high',
  'price', 'price_eur', 'confidence', 'confidence_reason', 'trend_7d', 'trend_30d'];

const skipAll = !url || !key;
const sb = skipAll ? null : createClient(url, key, { auth: { persistSession: false } });

let EN151_006, JA151_006, OP_EN, NOCANON;

before(async () => {
  if (skipAll) return;
  ({ data: [EN151_006] = [] } = await sb.from('cards')
    .select('id,canonical_card_id,set_id,card_number')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('source', 'tcgdex').eq('set_id', 'sv03.5').eq('card_number', '006').limit(1));
  ({ data: [JA151_006] = [] } = await sb.from('cards')
    .select('id,canonical_card_id,set_id,card_number')
    .eq('tcg', 'pokemon').eq('lang', 'ja').eq('set_id', 'SV2a').eq('card_number', '006').limit(1));
  ({ data: [OP_EN] = [] } = await sb.from('cards')
    .select('id,canonical_card_id,set_id,card_number')
    .eq('tcg', 'onepiece').eq('lang', 'en').not('canonical_card_id', 'is', null).limit(1));
  ({ data: [NOCANON] = [] } = await sb.from('cards')
    .select('id,tcg,set_id,card_number').is('canonical_card_id', null).limit(1));
});

async function cv(args) {
  const { data, error } = await sb.rpc('card_versions', args);
  assert.ifError(error);
  return data;
}

test('R1 — EN 151/006 -> includes JA SV2a/006 via a curated alias, with alias_note, NO market columns', async (t) => {
  if (skipAll || !EN151_006) return t.skip('fixture not present');
  const rows = await cv({ p_card_id: EN151_006.id });
  const ja = rows.find(r => r.lang === 'ja' && r.set_id === 'SV2a');
  assert.ok(ja, 'JA SV2a row present');
  assert.ok(['set_alias', 'number_alias'].includes(ja.link_basis), `curated link, got ${ja.link_basis}`);
  assert.equal(ja.link_confidence, 'confirmed');
  assert.ok(ja.alias_note && ja.alias_note.length > 0, 'alias_note present on the linked JA row');
  const self = rows.find(r => r.card_id === EN151_006.id);
  assert.ok(self && self.link_basis === 'self' && self.is_query_row === true);
  for (const r of rows) for (const c of MARKET_COLS) assert.equal(r[c], undefined, `no ${c} column`);
});

test('R1b — EN 151/199 (secret rare, NOT in verified 001-151 range) -> no JA link', async (t) => {
  if (skipAll) return t.skip('env');
  const { data } = await sb.from('cards').select('id')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('source', 'tcgdex').eq('set_id', 'sv03.5').eq('card_number', '199').limit(1);
  if (!data?.[0]) return t.skip('no fixture');
  const rows = await cv({ p_card_id: data[0].id });
  assert.ok(rows.every(r => r.lang !== 'ja'), '#199 is a renumbered SR — JA must NOT be linked');
});

test('R2 — symmetry: JA SV2a/006 -> includes EN sv03.5/006', async (t) => {
  if (skipAll || !JA151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: JA151_006.id });
  assert.ok(rows.some(r => r.lang === 'en' && r.set_id === 'sv03.5'));
  const self = rows.find(r => r.card_id === JA151_006.id);
  assert.ok(self && self.link_basis === 'self');
});

test('R3 — unmapped / candidate-only set -> no set_alias or number_alias rows', async (t) => {
  if (skipAll) return t.skip('env');
  const { data } = await sb.from('cards').select('id').eq('tcg', 'pokemon').eq('lang', 'ja').eq('set_id', 'SV1a').limit(1);
  if (!data?.[0]) return t.skip('no SV1a fixture');
  const rows = await cv({ p_card_id: data[0].id });
  assert.ok(rows.every(r => r.link_basis !== 'set_alias' && r.link_basis !== 'number_alias'),
    'SV1a is candidate/partial — must not auto-link');
});

test('R3b — set_identity_key collapse must NOT cross languages (JA SV8 != EN sv08)', async (t) => {
  if (skipAll) return t.skip('env');
  // set_identity_key('SV8') == set_identity_key('sv08') == 'sv8', but they are
  // different sets: EN sv08 #100 = Annihilape, JA SV8 #100 = a Trainer item.
  const rows = await cv({ p_tcg: 'pokemon', p_set_id: 'sv08', p_card_number: '100' });
  assert.ok(rows.length > 0);
  assert.ok(rows.every(r => r.lang !== 'ja'), 'no JA row may be linked by bare spelling-collapse');
  assert.ok(rows.every(r => r.link_basis === 'same_concept'));
});

test('R4 — One Piece: all langs via same_canonical/self (regression — still works)', async (t) => {
  if (skipAll || !OP_EN) return t.skip('fixture');
  const rows = await cv({ p_canonical_card_id: OP_EN.canonical_card_id });
  assert.ok(rows.length >= 1);
  assert.ok(rows.every(r => ['self', 'same_canonical', 'same_concept'].includes(r.link_basis)));
  assert.ok(rows.some(r => r.link_basis === 'same_canonical' || r.link_basis === 'self'));
});

test('R5 — card without canonical_card_id: does not crash', async (t) => {
  if (skipAll || !NOCANON) return t.skip('fixture');
  const rows = await cv({ p_card_id: NOCANON.id });
  assert.ok(Array.isArray(rows));
  assert.ok(rows.some(r => r.card_id === NOCANON.id));
});

test('R6 — card_versions_batch: query_idx maps rows to inputs', async (t) => {
  if (skipAll || !EN151_006) return t.skip('fixture');
  const { data, error } = await sb.rpc('card_versions_batch', { p_queries: [
    { tcg: 'pokemon', set_id: 'sv03.5', card_number: '006' },
    { tcg: 'pokemon', set_id: 'zzz-nope', card_number: '0' },
  ]});
  assert.ifError(error);
  assert.ok(data.some(r => r.query_idx === 0 && r.lang === 'ja'));
  assert.ok(data.every(r => r.query_idx === 0), 'query 1 (zzz-nope) yields no rows');
});

test('R7 — output schema: required columns present, market columns absent', async (t) => {
  if (skipAll || !EN151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: EN151_006.id });
  const cols = new Set(Object.keys(rows[0] || {}));
  for (const req of ['card_id', 'lang', 'link_basis', 'link_confidence', 'xlang_key', 'slug', 'is_query_row', 'alias_note'])
    assert.ok(cols.has(req), `column ${req} required`);
  for (const banned of MARKET_COLS) assert.equal(cols.has(banned), false, `column ${banned} must not exist`);
});

test('R8 — bounded: no concept returns > 200 rows', async (t) => {
  if (skipAll || !EN151_006) return t.skip('fixture');
  const rows = await cv({ p_card_id: EN151_006.id });
  assert.ok(rows.length <= 200);
});

test('R9 — candidate set_alias does not affect xlang_key / linking', async (t) => {
  if (skipAll) return t.skip('env');
  const testAlias = 'zztestcand';
  await sb.from('set_alias').delete().eq('alias_set_id', testAlias);
  const { error: insErr } = await sb.from('set_alias').insert({
    tcg: 'pokemon', alias_set_id: testAlias, canonical_set_id: 'sv03.5',
    relation: 'equivalent', confidence: 'candidate', source: 'test', note: 'throwaway candidate for R9' });
  assert.ifError(insErr);
  try {
    const { data } = await sb.rpc('xlang_key', { p_tcg: 'pokemon', p_set_id: testAlias, p_card_number: '006' });
    assert.equal(data, 'pokemon:zztestcand:6', 'candidate alias is inert — raw key');
  } finally {
    await sb.from('set_alias').delete().eq('alias_set_id', testAlias);
  }
});

test('xlang_key SQL matches the JS resolver (cross-lang.js)', async (t) => {
  if (skipAll) return t.skip('env');
  const { data: sa } = await sb.from('set_alias').select('*');
  const { data: na } = await sb.from('card_number_alias').select('*');
  const opts = { setAliases: sa || [], numberAliases: na || [] };
  const cases = [
    ['pokemon', 'sv03.5', '006'], ['pokemon', 'SV2a', '006'], ['pokemon', 'sv3pt5', '199'],
    ['pokemon', 'XY9a', '006'], ['onepiece', 'OP-01', 'OP01-001'], ['pokemon', 'SV1a', '010'],
  ];
  for (const [tcg, setId, num] of cases) {
    const { data: sql } = await sb.rpc('xlang_key', { p_tcg: tcg, p_set_id: setId, p_card_number: num });
    assert.equal(sql, xlangKey(tcg, setId, num, opts), `${tcg}/${setId}/${num}`);
  }
});
