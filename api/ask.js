// POST /api/ask — Ask DraGold agent endpoint.
//
//   { message: string, history?: [{role,content}] }
//   -> { answer, meta, evidence }   (see api/_lib/ask/agent.js)
//
// Optional Authorization: Bearer <supabase access token> enables the `collection`
// tool for that user (RLS-scoped). Anonymous requests work for everything else.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, VITE_SUPABASE_ANON_KEY,
//      DRAGOLD_LLM_PROVIDER (ollama|gemini|anthropic), OLLAMA_BASE_URL / GEMINI_API_KEY / ANTHROPIC_API_KEY,
//      (optional) EBAY_CLIENT_ID/SECRET for live_market.

import { runAgent } from './_lib/ask/agent.js';
import { serviceClient, userClient } from './_lib/ask/db.js';

// The agent may run several tool round-trips + LLM steps. Hosted providers
// (Gemini/Anthropic) finish in ~5–20s; a self-hosted Ollama can take much
// longer. 300s needs a Vercel plan that allows it; Hobby caps lower.
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const message = (body?.message || '').toString().trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message too long (max 2000 chars)' });

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

  let sb;
  try { sb = serviceClient(); }
  catch (e) { return res.status(500).json({ error: 'server misconfigured', detail: String(e.message) }); }
  const userSb = userClient(jwt);
  // verified user id (Supabase checks the JWT signature), not a client-supplied claim
  let userId = null;
  if (userSb) { try { const { data } = await userSb.auth.getUser(); userId = data?.user?.id || null; } catch { /* anon */ } }

  let result;
  try {
    result = await runAgent({ message, history, ctx: { sb, userSb } });
  } catch (e) {
    return res.status(500).json({ error: 'agent failed', detail: String(e?.message || e) });
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
