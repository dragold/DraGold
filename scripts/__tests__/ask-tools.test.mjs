// Ask DraGold — deterministic tool tests. Live prod, read-only.
//   set -a && source .env.local && set +a && node --test scripts/__tests__/ask-tools.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import * as impl from '../../api/_lib/ask/toolImpls.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key;
const sb = skip ? null : createClient(url, key, { auth: { persistSession: false } });
const ctx = () => ({ sb, userSb: null });

let charizardId = null;

before(async () => {
  if (skip) return;
  const { data } = await sb.from('cards').select('id')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('set_id', 'sv03.5').eq('card_number', '006').eq('source', 'tcgdex').limit(1);
  charizardId = data?.[0]?.id || null;
});

test('card_search — finds a known card, identity only, no price fields', async (t) => {
  if (skip) return t.skip('env');
  const out = await impl.cardSearch(ctx(), { query: 'Charizard ex 151', tcg: 'pokemon', limit: 5 });
  assert.ok(!out.error, out.error);
  assert.ok(out.results.length > 0);
  const r = out.results[0];
  for (const k of ['card_id', 'name', 'set_name', 'card_number', 'tcg', 'lang']) assert.ok(k in r);
  for (const k of ['price', 'price_usd', 'estimated_value', 'value']) assert.equal(r[k], undefined);
});

test('card_versions — EN 151/006 links the JA printing via a curated alias', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const out = await impl.cardVersions(ctx(), { card_id: charizardId });
  assert.ok(!out.error, out.error);
  const ja = (out.versions || []).find(v => v.lang === 'ja');
  assert.ok(ja, 'JA version present');
  assert.ok(['set_alias', 'number_alias'].includes(ja.link_basis));
  assert.ok(ja.alias_note && ja.alias_note.length > 0);
});

test('card_versions — unknown card: no versions, explicit "no confirmed match" guidance', async (t) => {
  if (skip) return t.skip('env');
  const out = await impl.cardVersions(ctx(), { tcg: 'pokemon', set_id: 'zzz-nope', card_number: '999' });
  assert.ok(!out.error);
  assert.equal(out.count, 0);
  assert.match(out.guidance, /no confirmed cross-language match|do not infer/i);
});

test('card_valuation — returns a structured estimate or an explicit unavailable reason', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const out = await impl.cardValuation(ctx(), { card_id: charizardId });
  assert.ok(!out.error, out.error);
  if (out.available === false) {
    assert.ok(out.unavailable_reason);
  } else {
    assert.equal(typeof out.value, 'number');
    assert.ok(['high', 'medium', 'low', 'none'].includes(out.confidence));
    assert.ok(out.as_of, 'has as_of');
    assert.ok(Array.isArray(out.sources));
    assert.ok(out.disclaimer);
  }
});

test('card_valuation — nonexistent card -> available:false, never a fabricated number', async (t) => {
  if (skip) return t.skip('env');
  const out = await impl.cardValuation(ctx(), { card_id: 'pokemon:tcgdex:does-not-exist:en' });
  assert.ok(!out.error || out.available === false);
  assert.notEqual(typeof out.value, 'number');
});

test('live_market — degrades cleanly when eBay is not configured', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const out = await impl.liveMarket(ctx(), { card_id: charizardId, market: 'IT' });
  assert.ok('available' in out);
  if (!out.available) assert.ok(['ebay_not_configured', 'ebay_auth_failed', 'ebay_api_error', 'card_not_found'].includes(out.reason));
});

test('collection — requires sign-in, returns a clear reason (no fabrication)', async (t) => {
  if (skip) return t.skip('env');
  const out = await impl.collection(ctx(), { mode: 'summary' });
  assert.equal(out.available, false);
  assert.equal(out.reason, 'sign_in_required');
});

test('knowledge_graph — real edges (cross-language, illustrator, set rel), honest roadmap note', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const out = await impl.knowledgeGraph(ctx(), { card_id: charizardId });
  assert.ok(!out.error, out.error);
  assert.ok(Array.isArray(out.cross_language));
  assert.ok(out.cross_language.some(c => c.lang === 'ja'), 'JA edge present');
  assert.ok(Array.isArray(out.same_illustrator));
  assert.ok(Array.isArray(out.set_relationships));
  assert.match(out.roadmap_note, /roadmap|not.*available|not yet/i);
});
