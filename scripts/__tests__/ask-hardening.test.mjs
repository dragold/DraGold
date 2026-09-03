// Ask DraGold — provider resolution + rate limiter unit tests. No LLM, no network.
//   node --test scripts/__tests__/ask-hardening.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerStatus, resolveModel, estimateCost } from '../../api/_lib/ask/providers.js';
import { checkRateLimit, _resetIpBuckets, _LIMITS } from '../../api/_lib/ask/rateLimit.js';

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally {
    for (const k of Object.keys(saved)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

// ── provider resolution ────────────────────────────────────────────────────
test('providerStatus: ollama is always configured (no key needed)', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'ollama', DRAGOLD_LLM_MODEL: null }, () => {
    const s = providerStatus();
    assert.equal(s.provider, 'ollama');
    assert.equal(s.ok, true);
    assert.ok(s.base_url);
  });
});

test('providerStatus: gemini without a key -> ok:false, clear reason', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'gemini', GEMINI_API_KEY: null, GOOGLE_GENERATIVE_AI_API_KEY: null }, () => {
    const s = providerStatus();
    assert.equal(s.ok, false);
    assert.match(s.reason, /GEMINI_API_KEY/);
  });
});

test('providerStatus: anthropic without a key -> ok:false', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: null }, () => {
    assert.equal(providerStatus().ok, false);
  });
});

test('providerStatus: unknown provider -> ok:false, names the valid options', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'openai' }, () => {
    const s = providerStatus();
    assert.equal(s.ok, false);
    assert.match(s.reason, /ollama \| gemini \| anthropic/);
  });
});

test('resolveModel: throws a clear error for a missing key', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'gemini', GEMINI_API_KEY: null, GOOGLE_GENERATIVE_AI_API_KEY: null }, () => {
    assert.throws(() => resolveModel(), /GEMINI_API_KEY is not set/);
  });
});

test('resolveModel: ollama builds a model with no key', () => {
  withEnv({ DRAGOLD_LLM_PROVIDER: 'ollama', DRAGOLD_LLM_MODEL: 'gpt-oss:20b' }, () => {
    const { model, provider, modelId } = resolveModel();
    assert.equal(provider, 'ollama');
    assert.equal(modelId, 'gpt-oss:20b');
    assert.ok(model);
  });
});

test('estimateCost: known model -> a number; unknown/ollama -> null', () => {
  assert.equal(typeof estimateCost('gemini-2.0-flash', { inputTokens: 1000, outputTokens: 500 }), 'number');
  assert.equal(estimateCost('gpt-oss:20b', { inputTokens: 1000, outputTokens: 500 }), null);
  assert.equal(estimateCost('gemini-2.0-flash', null), null);
});

// ── rate limiter ───────────────────────────────────────────────────────────
function fakeSb(globalCount, userCount) {
  return {
    from() {
      return {
        select() { return this; },
        gte() { return this; },
        eq(col) { this._user = col === 'user_id'; return this; },
        then(resolve) { resolve({ count: this._user ? userCount : globalCount }); },
      };
    },
  };
}

test('rate limit: under all limits -> ok', async () => {
  _resetIpBuckets();
  const r = await checkRateLimit(fakeSb(0, 0), { ip: '1.1.1.1', userId: null });
  assert.equal(r.ok, true);
});

test('rate limit: global cap hit -> 429 scope global', async () => {
  _resetIpBuckets();
  const r = await checkRateLimit(fakeSb(_LIMITS.global, 0), { ip: '1.1.1.2', userId: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'global');
  assert.equal(r.limit, _LIMITS.global);
});

test('rate limit: per-user cap hit -> 429 scope user', async () => {
  _resetIpBuckets();
  const r = await checkRateLimit(fakeSb(0, _LIMITS.user), { ip: '1.1.1.3', userId: 'u1' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'user');
});

test('rate limit: anonymous IP cap hit after N calls in the window', async () => {
  _resetIpBuckets();
  const sb = fakeSb(0, 0);
  let last;
  for (let i = 0; i < _LIMITS.ip + 2; i++) last = await checkRateLimit(sb, { ip: '9.9.9.9', userId: null });
  assert.equal(last.ok, false);
  assert.equal(last.reason, 'ip');
  assert.ok(last.retry_after || last.retryAfter);
});

test('rate limit: a DB count failure does not hard-block (fail-open on global)', async () => {
  _resetIpBuckets();
  const brokenSb = { from() { return { select() { return this; }, gte() { return this; }, eq() { return this; }, then(_r, rej) { rej(new Error('db down')); } }; } };
  const r = await checkRateLimit(brokenSb, { ip: '2.2.2.2', userId: null });
  assert.equal(r.ok, true); // anonymous IP bucket still applies but this first call is fine
});
