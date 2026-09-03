// Ask DraGold — agent orchestration tests with a mock LLM. Live prod DB (read-only)
// for the tool executions; the model is mocked so the test is deterministic.
//   set -a && source .env.local && set +a && node --test scripts/__tests__/ask-agent.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { MockLanguageModelV2 } from 'ai/test';
import { runAgent } from '../../api/_lib/ask/agent.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !key;
const sb = skip ? null : createClient(url, key, { auth: { persistSession: false } });

let charizardId = null;
before(async () => {
  if (skip) return;
  const { data } = await sb.from('cards').select('id')
    .eq('tcg', 'pokemon').eq('lang', 'en').eq('set_id', 'sv03.5').eq('card_number', '006').eq('source', 'tcgdex').limit(1);
  charizardId = data?.[0]?.id || null;
});

// A mock model that: step 1 calls card_search, step 2 calls card_versions with
// the first result's id, step 3 emits a final text answer.
function scriptedModel(steps) {
  let i = 0;
  return new MockLanguageModelV2({
    doGenerate: async () => {
      const step = steps[Math.min(i, steps.length - 1)];
      i++;
      return {
        finishReason: step.content ? 'stop' : 'tool-calls',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        content: step.content
          ? [{ type: 'text', text: step.content }]
          : [{ type: 'tool-call', toolCallId: `c${i}`, toolName: step.toolName, input: JSON.stringify(step.input) }],
        warnings: [],
      };
    },
  });
}

test('agent runs a tool chain and derives grounded evidence', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const model = scriptedModel([
    { toolName: 'card_search', input: { query: 'Charizard ex 151', tcg: 'pokemon' } },
    { toolName: 'card_versions', input: { card_id: charizardId } },
    { content: 'FACT: The card is Charizard ex (151, #006). FACT: card_versions links a Japanese printing via a curated mapping. INFERENCE: they are the same physical card.' },
  ]);
  const out = await runAgent({ message: 'What is Charizard ex 151 and its Japanese version?', ctx: { sb, userSb: null }, modelOverride: model });
  assert.equal(out.error, undefined);
  assert.ok(out.answer.length > 0);
  assert.deepEqual(new Set(out.meta.tools_used), new Set(['card_search', 'card_versions']));
  assert.ok(out.evidence.cards.length > 0, 'cards in evidence');
  assert.ok(out.evidence.versions.some(v => v.lang === 'ja'), 'JA version in evidence');
  assert.ok(out.evidence.versions.every(v => v.link_basis), 'every version has a link_basis (provenance)');
  assert.equal(out.meta.outcome, 'ok');
  assert.ok(out.meta.usage.total_tokens >= 120, 'token usage recorded');
});

test('agent marks outcome=insufficient_data when it declines and no valuation was obtained', async (t) => {
  if (skip) return t.skip('env');
  const model = scriptedModel([
    { toolName: 'card_versions', input: { tcg: 'pokemon', set_id: 'zzz-nope', card_number: '1' } },
    { content: "I don't have enough evidence to identify that card, and there is no confirmed cross-language match." },
  ]);
  const out = await runAgent({ message: 'gibberish card xyz', ctx: { sb, userSb: null }, modelOverride: model });
  assert.equal(out.meta.outcome, 'insufficient_data');
  assert.equal(out.evidence.valuations.length, 0);
});

test('agent surfaces card_valuation metadata (source + as_of + confidence) into evidence', async (t) => {
  if (skip || !charizardId) return t.skip('fixture');
  const model = scriptedModel([
    { toolName: 'card_valuation', input: { card_id: charizardId } },
    { content: 'Reported the valuation from tool output.' },
  ]);
  const out = await runAgent({ message: 'value?', ctx: { sb, userSb: null }, modelOverride: model });
  const v = out.evidence.valuations[0];
  assert.ok(v, 'a valuation entry exists');
  if (v.available !== false) {
    assert.ok('confidence' in v && 'as_of' in v && 'sources' in v);
  } else {
    assert.ok(v.unavailable_reason);
  }
});

test('agent tolerates a tool error without crashing', async (t) => {
  if (skip) return t.skip('env');
  const model = scriptedModel([
    { toolName: 'card_valuation', input: { card_id: 'totally:invalid' } },
    { content: 'No reliable valuation available for that card.' },
  ]);
  const out = await runAgent({ message: 'x', ctx: { sb, userSb: null }, modelOverride: model });
  assert.equal(out.error, undefined);
  assert.ok(out.answer.length > 0);
});
