// Ask DraGold — security properties of the tool layer. Live prod DB, read-only.
// The LLM is treated as UNTRUSTED: it can only pick from a fixed set of tools and
// pass typed args. It cannot run SQL, pick an RPC, read env, or bypass RLS.
//   set -a && source .env.local && set +a && node --test scripts/__tests__/ask-security.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import * as impl from '../../api/_lib/ask/toolImpls.js';
import { buildTools, TOOL_NAMES } from '../../api/_lib/ask/tools.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key;
const sb = skip ? null : createClient(url, key, { auth: { persistSession: false } });
const ctx = () => ({ sb, userSb: null });

test('tool surface is exactly the 6 read-only tools — no db/sql/exec tool exists', () => {
  const tools = buildTools(ctx(), () => {});
  assert.deepEqual(Object.keys(tools).sort(), [...TOOL_NAMES].sort());
  for (const name of Object.keys(tools)) {
    assert.ok(!/sql|query_db|exec|admin|write|update|delete|insert|raw/i.test(name), `tool ${name} name looks write-capable`);
  }
});

test('card_search: SQL-injection-style query is passed as a parameter, not executed', async (t) => {
  if (skip) return t.skip('env');
  const payloads = [
    "'; drop table cards; --",
    "Charizard' OR '1'='1",
    'pikachu; select * from auth.users',
    '${process.env.SUPABASE_SERVICE_KEY}',
  ];
  for (const q of payloads) {
    const out = await impl.cardSearch(ctx(), { query: q, limit: 3 });
    assert.ok(!out.error || /search_cards failed/.test(out.error), `payload handled: ${q}`);
    assert.ok(Array.isArray(out.results));
    // never returns auth/user data shapes
    for (const r of out.results) assert.ok(!('email' in r) && !('encrypted_password' in r));
  }
  // sanity: cards table still there
  const { count } = await sb.from('cards').select('id', { count: 'exact', head: true }).limit(1);
  assert.ok(count > 100000, 'cards table intact');
});

test('card_versions / card_valuation: hostile ids fail safe, never fabricate', async (t) => {
  if (skip) return t.skip('env');
  const ids = ["' OR 1=1 --", '../../etc/passwd', 'pokemon:x'.repeat(200), '{{7*7}}'];
  for (const id of ids) {
    const v = await impl.cardVersions(ctx(), { card_id: id });
    assert.ok(Array.isArray(v.versions) && v.versions.length === 0);
    const val = await impl.cardValuation(ctx(), { card_id: id });
    assert.notEqual(typeof val.value, 'number');
  }
});

test('collection: no way to read another user — tool has no user-id param and needs userSb', async (t) => {
  if (skip) return t.skip('env');
  // anonymous ctx: must refuse
  const anon = await impl.collection({ sb, userSb: null }, { mode: 'summary' });
  assert.equal(anon.available, false);
  assert.equal(anon.reason, 'sign_in_required');
  // the tool schema exposes only mode + set_id — no user_id / owner / email field
  const tools = buildTools(ctx(), () => {});
  const schemaKeys = Object.keys(tools.collection.inputSchema.shape || tools.collection.inputSchema._def?.shape?.() || {});
  assert.ok(!schemaKeys.some(k => /user|owner|email|uid|account/i.test(k)), `collection schema keys: ${schemaKeys}`);
});

test('tools never surface secrets / env values in their output', async (t) => {
  if (skip) return t.skip('env');
  const { data } = await sb.from('cards').select('id')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('set_id', 'sv03.5').eq('card_number', '006').limit(1);
  const cid = data?.[0]?.id;
  if (!cid) return t.skip('fixture');
  const outputs = await Promise.all([
    impl.cardSearch(ctx(), { query: 'charizard' }),
    impl.cardVersions(ctx(), { card_id: cid }),
    impl.cardValuation(ctx(), { card_id: cid }),
    impl.knowledgeGraph(ctx(), { card_id: cid }),
  ]);
  const blob = JSON.stringify(outputs);
  const secretHint = process.env.SUPABASE_SERVICE_KEY?.slice(0, 12);
  assert.ok(secretHint && !blob.includes(secretHint), 'service key fragment not in tool output');
  assert.ok(!/service_role|SUPABASE_SERVICE|ANTHROPIC_API_KEY|GEMINI_API_KEY|eyJ[A-Za-z0-9_-]{20}/.test(blob), 'no key-shaped strings');
});

test('buildTools wrapper: a throwing tool is caught and returned as an error object, not a crash', async () => {
  const tools = buildTools({ sb: null, userSb: null }, () => {});
  const out = await tools.card_search.execute({ query: 'x' });
  assert.ok(out && typeof out === 'object');
  assert.ok(out.error, 'null sb -> error object, no throw');
});
