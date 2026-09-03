// Ask DraGold — AI SDK tool definitions. Thin wrappers over toolImpls.js that
// add zod schemas + per-call tracking for agent_queries.
import { tool } from 'ai';
import { z } from 'zod';
import * as impl from './toolImpls.js';

/**
 * @param {object} ctx  { sb, userSb }
 * @param {(rec:{tool,args,ok,ms,error?})=>void} track
 */
export function buildTools(ctx, track) {
  const wrap = (name, fn) => async (args) => {
    const t0 = Date.now();
    try {
      const out = await fn(ctx, args);
      const ok = !out?.error;
      track({ tool: name, args, ok, ms: Date.now() - t0, error: out?.error });
      return out;
    } catch (e) {
      track({ tool: name, args, ok: false, ms: Date.now() - t0, error: String(e?.message || e) });
      return { error: `tool ${name} threw: ${String(e?.message || e)}` };
    }
  };

  return {
    card_search: tool({
      description: 'Search the DraGold catalogue for a card by name, set code, or card number. Returns identity fields only (no prices). Use this first to resolve which card the user means.',
      inputSchema: z.object({
        query: z.string().describe('name, set code, or "name set number" e.g. "Charizard ex 151 006"'),
        tcg: z.enum(['pokemon', 'onepiece', 'mtg', 'ygo']).nullish(),
        lang: z.string().nullish().describe('language hint e.g. "en", "ja"'),
        limit: z.number().int().min(1).max(25).nullish(),
      }),
      execute: wrap('card_search', impl.cardSearch),
    }),

    card_versions: tool({
      description: 'Given a card, return every regional/language printing of the SAME physical card, with provenance (link_basis, link_confidence, alias_note). This is the ONLY way to establish an EN↔JA equivalence. Pass card_id, or canonical_card_id, or the triple (tcg, set_id, card_number).',
      inputSchema: z.object({
        card_id: z.string().nullish(),
        canonical_card_id: z.string().uuid().nullish(),
        tcg: z.string().nullish(),
        set_id: z.string().nullish(),
        card_number: z.string().nullish(),
      }),
      execute: wrap('card_versions', impl.cardVersions),
    }),

    card_valuation: tool({
      description: 'DraGold market valuation for one printing. Returns value + currency + low/median/high + n_observations + n_sources + trend + confidence + confidence_reason + sources + as_of. If unavailable, returns available:false with a reason. Never invent a value if this is unavailable.',
      inputSchema: z.object({
        card_id: z.string().describe('cards.id, e.g. "pokemon:tcgdex:sv03.5-006:en"'),
        currency: z.enum(['EUR']).nullish(),
      }),
      execute: wrap('card_valuation', impl.cardValuation),
    }),

    live_market: tool({
      description: 'ACTIVE eBay listings for a card ("what the market is asking right now"), separate from the DraGold valuation. Returns available:false if eBay is not configured. Not sold prices.',
      inputSchema: z.object({
        card_id: z.string(),
        market: z.enum(['IT', 'DE', 'FR', 'ES', 'GB', 'US']).nullish(),
        limit: z.number().int().min(1).max(12).nullish(),
      }),
      execute: wrap('live_market', impl.liveMarket),
    }),

    collection: tool({
      description: "The signed-in user's own collection. mode:'summary' → total estimated EUR value + counts + confidence mix. mode:'set_completion' (needs set_id) → owned vs total for a set. Returns available:false with reason 'sign_in_required' if the user is not signed in.",
      inputSchema: z.object({
        mode: z.enum(['summary', 'set_completion']).nullish(),
        set_id: z.string().nullish(),
      }),
      execute: wrap('collection', impl.collection),
    }),

    knowledge_graph: tool({
      description: 'DraGold Knowledge Graph context for a card: cross-language/cross-region printings, other cards by the same illustrator, set/region relationships, and canonical reprints/variants. Includes a roadmap_note stating what is not yet in the graph.',
      inputSchema: z.object({ card_id: z.string() }),
      execute: wrap('knowledge_graph', impl.knowledgeGraph),
    }),
  };
}

export const TOOL_NAMES = ['card_search', 'card_versions', 'card_valuation', 'live_market', 'collection', 'knowledge_graph'];
