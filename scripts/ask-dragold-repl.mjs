#!/usr/bin/env node
/**
 * Ask DraGold — manual end-to-end runner (real LLM + real DraGold data).
 *   set -a && source .env.local && set +a
 *   DRAGOLD_LLM_PROVIDER=ollama DRAGOLD_LLM_MODEL=gpt-oss:20b node scripts/ask-dragold-repl.mjs "What is Charizard ex 151 and what's the Japanese version worth?"
 */
import { createClient } from '@supabase/supabase-js';
import { runAgent } from '../api/_lib/ask/agent.js';

const q = process.argv.slice(2).join(' ') || 'What is Charizard ex from the 151 set, what is the equivalent Japanese card, and what is it worth?';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('Q:', q, '\n');
const out = await runAgent({ message: q, ctx: { sb, userSb: null } });
if (out.error) { console.error('ERROR:', out.error); process.exit(1); }
console.log('── ANSWER ──────────────────────────────────────────────\n' + out.answer + '\n');
console.log('── META ────────────────────────────────────────────────');
console.log(JSON.stringify(out.meta, null, 2));
console.log('── TOOL CALLS ──────────────────────────────────────────');
for (const c of out.tool_calls) console.log(` ${c.ok ? 'ok ' : 'ERR'} ${c.tool}(${JSON.stringify(c.args)}) ${c.ms}ms ${c.error || ''}`);
console.log('── EVIDENCE (keys) ─────────────────────────────────────');
console.log(' cards:', out.evidence.cards.length, '| versions:', out.evidence.versions.length,
  '| valuations:', out.evidence.valuations.length,
  '| live_market:', !!out.evidence.live_market, '| kg:', !!out.evidence.knowledge_graph);
