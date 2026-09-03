// Ask DraGold — agent orchestration. Deterministic tools + one LLM to plan/
// synthesise. The LLM never produces economic figures or identities itself; it
// reads them from tool output. The structured `evidence` block is derived from
// tool results (not a second LLM pass) so the frontend Dossier is grounded.
import { generateText, stepCountIs } from 'ai';
import { resolveModel, estimateCost } from './providers.js';
import { buildTools } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

const INSUFFICIENT_RE = /\b(don'?t have enough|not enough (?:data|evidence|information)|cannot (?:establish|determine|confirm)|no (?:reliable )?(?:data|valuation|match)|insufficient (?:data|evidence))\b/i;

export async function runAgent({ message, history = [], ctx, modelOverride = null }) {
  const t0 = Date.now();
  const { model, provider, modelId } = modelOverride
    ? { model: modelOverride, provider: 'mock', modelId: 'mock' }
    : resolveModel();

  const toolCalls = [];            // { tool, args, ok, ms, error? }
  const toolResults = [];          // { tool, output }
  const track = (rec) => toolCalls.push(rec);
  const tools = buildTools(ctx, track);

  const messages = [
    ...history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-8),
    { role: 'user', content: String(message) },
  ];

  let text = '';
  let usage = null;
  let finishReason = null;
  try {
    const res = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(8),
      onStepFinish(step) {
        for (const tr of step.toolResults || []) {
          toolResults.push({ tool: tr.toolName, output: tr.output ?? tr.result });
        }
      },
    });
    text = res.text || '';
    usage = res.usage || null;
    finishReason = res.finishReason || null;
    // fallback: some providers surface tool results only on the final object
    if (!toolResults.length) {
      for (const s of res.steps || []) for (const tr of s.toolResults || []) {
        toolResults.push({ tool: tr.toolName, output: tr.output ?? tr.result });
      }
    }
  } catch (e) {
    return {
      answer: null,
      error: String(e?.message || e),
      meta: { provider, model: modelId, latency_ms: Date.now() - t0, tools_used: [...new Set(toolCalls.map(c => c.tool))], outcome: 'error', usage: null, cost_usd: null },
      evidence: emptyEvidence(),
      tool_calls: toolCalls,
    };
  }

  const toolsUsed = [...new Set(toolCalls.map(c => c.tool))];
  const anyToolOk = toolCalls.some(c => c.ok);

  // If the model hit the step cap without producing a final answer, don't return
  // an empty string — say so, and hand back whatever the tools established.
  if (!text.trim()) {
    text = toolResults.length
      ? "I gathered data from DraGold's tools but did not finish composing an answer. The structured results below are what the tools returned."
      : "I could not complete this request — no answer was produced.";
    finishReason = finishReason || 'no-text';
  }

  const outcome = (!text.trim() || (INSUFFICIENT_RE.test(text) && !hasEconomicClaim(toolResults))) ? 'insufficient_data' : 'ok';

  const inTok = usage?.inputTokens ?? usage?.promptTokens ?? null;
  const outTok = usage?.outputTokens ?? usage?.completionTokens ?? null;

  return {
    answer: text,
    meta: {
      provider,
      model: modelId,
      latency_ms: Date.now() - t0,
      tools_used: toolsUsed,
      outcome,
      finish_reason: finishReason,
      usage: { input_tokens: inTok, output_tokens: outTok, total_tokens: usage?.totalTokens ?? ((inTok ?? 0) + (outTok ?? 0) || null) },
      cost_usd: estimateCost(modelId, usage),
      any_tool_succeeded: anyToolOk,
    },
    evidence: deriveEvidence(toolResults),
    tool_calls: toolCalls,
  };
}

function hasEconomicClaim(toolResults) {
  return toolResults.some(tr => tr.tool === 'card_valuation' && tr.output && tr.output.value != null);
}

function emptyEvidence() {
  return { cards: [], valuations: [], versions: [], live_market: null, knowledge_graph: null, collection: null };
}

function deriveEvidence(toolResults) {
  const ev = emptyEvidence();
  const seenCard = new Set();
  const addCard = (c) => {
    if (!c || !c.card_id || seenCard.has(c.card_id)) return;
    seenCard.add(c.card_id);
    ev.cards.push(c);
  };

  for (const { tool, output } of toolResults) {
    if (!output || output.error) continue;
    if (tool === 'card_search') {
      for (const r of output.results || []) addCard({
        card_id: r.card_id, name: r.name, name_en: r.name_en, set_name: r.set_name, set_id: r.set_id,
        card_number: r.card_number, lang: r.lang, tcg: r.tcg, rarity: r.rarity, illustrator: r.illustrator,
      });
    }
    if (tool === 'card_versions') {
      for (const v of output.versions || []) {
        addCard({ card_id: v.card_id, name: v.name, name_en: v.name_en, set_name: v.set_name, set_id: v.set_id, card_number: v.card_number, lang: v.lang, tcg: v.tcg, slug: v.slug });
        ev.versions.push({
          card_id: v.card_id, lang: v.lang, set_id: v.set_id, card_number: v.card_number, name: v.name,
          link_basis: v.link_basis, link_confidence: v.link_confidence, alias_note: v.alias_note, slug: v.slug,
        });
      }
    }
    if (tool === 'card_valuation' && output.available !== false) {
      ev.valuations.push({
        card_id: output.card_id, resolved_card_id: output.resolved_card_id, value: output.value, currency: output.currency,
        range: output.range, confidence: output.confidence, confidence_reason: output.confidence_reason,
        n_observations: output.n_observations, n_sources: output.n_sources,
        trend_7d_pct: output.trend_7d_pct, trend_30d_pct: output.trend_30d_pct,
        sources: output.sources, as_of: output.as_of, newest_observation_at: output.newest_observation_at,
      });
    }
    if (tool === 'card_valuation' && output.available === false) {
      ev.valuations.push({ card_id: output.card_id, available: false, unavailable_reason: output.unavailable_reason });
    }
    if (tool === 'live_market') ev.live_market = output;
    if (tool === 'knowledge_graph') {
      ev.knowledge_graph = output;
      for (const c of output.cross_language || []) addCard({ card_id: c.card_id, name: c.name, set_id: c.set_id, card_number: c.card_number, lang: c.lang });
    }
    if (tool === 'collection') ev.collection = output;
  }
  return ev;
}
