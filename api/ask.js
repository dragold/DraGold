// POST /api/ask — Ask DraGold agent endpoint.
//
//   { message: string, history?: [{role:'user'|'assistant', content:string}] }
//   -> 200 { answer, meta, evidence }        (see api/_lib/ask/agent.js)
//   -> 400 bad input · 429 rate limited · 503 provider not configured · 502 agent error
//
// Optional `Authorization: Bearer <supabase access token>` enables the `collection`
// tool for that user (RLS-scoped). Anonymous requests work for everything else.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, VITE_SUPABASE_ANON_KEY,
//      DRAGOLD_LLM_PROVIDER (ollama|gemini|anthropic),
//      OLLAMA_BASE_URL / GEMINI_API_KEY / ANTHROPIC_API_KEY,
//      (optional) EBAY_CLIENT_ID/SECRET for live_market,
//      (optional) ASK_RL_* to tune rate limits.

import { runAgent } from './_lib/ask/agent.js';
import { serviceClient, userClient } from './_lib/ask/db.js';
import { providerName, providerStatus } from './_lib/ask/providers.js';
import { checkRateLimit, clientIp, _LIMITS, _WINDOW_S } from './_lib/ask/rateLimit.js';

// The agent may run several tool round-trips + LLM steps. Hosted providers
// (Gemini/Anthropic) finish in ~5–20s; a self-hosted Ollama can take much
// longer. 300s needs a Vercel plan that allows it; Hobby caps lower.
export const config = { maxDuration: 300 };

const MAX_MESSAGE = 2000;
const MAX_HISTORY = 12;
const CONFIG_ERR_RE = /provider selected but .* is not set|unknown DRAGOLD_LLM_PROVIDER|Supabase (service )?env/i;

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE) }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET — config health, no secrets. Useful for beta ops.
  if (req.method === 'GET') {
    const st = providerStatus();
    return res.status(st.ok ? 200 : 503).json({
      service: 'ask-dragold',
      provider: { name: st.provider, model: st.modelId || null, configured: st.ok, ...(st.ok ? {} : { reason: st.reason }), ...(st.base_url ? { base_url: st.base_url } : {}) },
      rate_limit: { window_seconds: _WINDOW_S, limits: _LIMITS },
      live_market: !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST or GET' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid JSON body' });

  const message = (typeof body.message === 'string' ? body.message : '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `message too long (max ${MAX_MESSAGE} chars)` });
  const history = sanitizeHistory(body.history);

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || null;

  let sb;
  try { sb = serviceClient(); }
  catch (e) { return res.status(503).json({ error: 'server not configured', detail: String(e.message) }); }

  const userSb = userClient(jwt);
  // verified user id (Supabase checks the JWT signature), not a client-supplied claim
  let userId = null;
  if (userSb) { try { const { data } = await userSb.auth.getUser(); userId = data?.user?.id || null; } catch { /* treat as anonymous */ } }

  // ── rate limit ──────────────────────────────────────────────────────────
  const ip = clientIp(req);
  const rl = await checkRateLimit(sb, { ip, userId });
  res.setHeader('X-RateLimit-Window', String(rl.window_s));
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter || rl.window_s));
    return res.status(429).json({
      error: 'rate limited',
      scope: rl.reason,
      limit: rl.limit,
      window_seconds: rl.window_s,
      retry_after_seconds: rl.retryAfter || rl.window_s,
    });
  }

  // ── run ─────────────────────────────────────────────────────────────────
  let result;
  try {
    result = await runAgent({ message, history, ctx: { sb, userSb } });
  } catch (e) {
    return res.status(500).json({ error: 'agent failed', detail: String(e?.message || e) });
  }

  if (result.error && CONFIG_ERR_RE.test(result.error)) {
    return res.status(503).json({
      error: 'LLM provider not configured',
      provider: providerName(),
      detail: result.error,
      hint: 'Set DRAGOLD_LLM_PROVIDER and the matching key (or run Ollama and set OLLAMA_BASE_URL).',
    });
  }

  // observability — best-effort, never blocks the response
  try {
    const m = result.meta || {};
    await sb.from('agent_queries').insert({
      query: message,
      user_id: userId,
      provider: m.provider || null,
      model: m.model || null,
      latency_ms: m.latency_ms ?? null,
      tools_used: m.tools_used || [],
      tool_calls: (result.tool_calls || []).map(c => ({ tool: c.tool, ok: c.ok, ms: c.ms, error: c.error || null })),
      outcome: result.error ? 'error' : (m.outcome || 'ok'),
      error: result.error || null,
      input_tokens: m.usage?.input_tokens ?? null,
      output_tokens: m.usage?.output_tokens ?? null,
      total_tokens: m.usage?.total_tokens ?? null,
      cost_usd: m.cost_usd ?? null,
    });
  } catch { /* best-effort */ }

  if (result.error) return res.status(502).json({ error: result.error, meta: result.meta });

  const { tool_calls, ...publicResult } = result;
  return res.status(200).json(publicResult);
}
