// Ask DraGold — LLM provider abstraction.
//
// The DraGold Core does NOT depend structurally on any single vendor. The agent
// runs identically under Ollama (self-hosted, default), Gemini, or Anthropic —
// selected by env. A fully self-hosted deployment (Ollama + Postgres) is a
// first-class path and needs no proprietary API key.
//
// Env:
//   DRAGOLD_LLM_PROVIDER  ollama | gemini | anthropic     (default: ollama)
//   DRAGOLD_LLM_MODEL     model id override                (per-provider default below)
//   OLLAMA_BASE_URL       default http://localhost:11434
//   GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY
//   ANTHROPIC_API_KEY

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';

const DEFAULTS = {
  ollama: 'llama3.1',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-sonnet-5',
};

// rough per-1M-token USD, for agent_queries.cost_usd. null = unknown/free.
const PRICING = {
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
  'gemini-1.5-flash': { in: 0.075, out: 0.3 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
};

export function providerName() {
  return (process.env.DRAGOLD_LLM_PROVIDER || 'ollama').toLowerCase();
}

/** Returns { model, provider, modelId }. Throws a clear error if creds are missing. */
export function resolveModel() {
  const provider = providerName();
  const modelId = process.env.DRAGOLD_LLM_MODEL || DEFAULTS[provider] || DEFAULTS.ollama;

  if (provider === 'ollama') {
    const baseURL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '') + '/v1';
    const ollama = createOpenAICompatible({ name: 'ollama', baseURL, apiKey: 'ollama' });
    return { model: ollama(modelId), provider, modelId };
  }

  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('gemini provider selected but GEMINI_API_KEY is not set');
    const google = createGoogleGenerativeAI({ apiKey });
    return { model: google(modelId), provider, modelId };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('anthropic provider selected but ANTHROPIC_API_KEY is not set');
    const anthropic = createAnthropic({ apiKey });
    return { model: anthropic(modelId), provider, modelId };
  }

  throw new Error(`unknown DRAGOLD_LLM_PROVIDER: ${provider} (expected ollama | gemini | anthropic)`);
}

/** USD cost estimate from token usage, or null when pricing is unknown (e.g. Ollama). */
export function estimateCost(modelId, usage) {
  const p = PRICING[modelId];
  if (!p || !usage) return null;
  const inTok = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outTok = usage.outputTokens ?? usage.completionTokens ?? 0;
  return +(((inTok * p.in) + (outTok * p.out)) / 1_000_000).toFixed(6);
}
