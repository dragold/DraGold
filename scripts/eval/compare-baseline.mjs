#!/usr/bin/env node
/**
 * Ask DraGold — competitive proof. Same LLM, same questions:
 *   A) BASELINE  — the model alone, no DraGold tools ("a generic assistant")
 *   B) ASK DRAGOLD — the model + DraGold's deterministic tools
 *
 * We are NOT claiming our LLM is smarter. We show that DraGold gives an LLM
 * deterministic TCG intelligence (identity, EN↔JA, provenance, market values)
 * that a generic model does not have — and that the generic model fills the gap
 * with confident fabrication.
 *
 *   set -a && source .env.local && set +a
 *   DRAGOLD_LLM_PROVIDER=ollama DRAGOLD_LLM_MODEL=llama3.2:latest node scripts/eval/compare-baseline.mjs [--json out.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { runAgent } from '../../api/_lib/ask/agent.js';
import { resolveModel } from '../../api/_lib/ask/providers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

// Questions chosen where a generic model is very likely to hallucinate.
const QUESTIONS = [
  { id: 'q1', focus: 'identity + EN↔JA',
    q: 'What is the equivalent Japanese card for Pokémon Charizard ex, card 006 of the 151 set, and what is its Japanese card number?' },
  { id: 'q2', focus: 'market value + provenance',
    q: 'What is the current market value in EUR of Pokémon 151 Charizard ex (006), and what source and date is that from?' },
  { id: 'q3', focus: 'false identity trap',
    q: 'Is Pokémon Surging Sparks card #100 the same card as the Japanese SV8 card #100?' },
  { id: 'q4', focus: 'renumbered secret rare',
    q: 'What is the Japanese card number for the English Pokémon 151 Charizard ex secret rare, English number 199?' },
  { id: 'q5', focus: 'insufficient data',
    q: 'What is the market value of the Japanese リザードンex from Pokémon Card 151 (SV2a)?' },
  { id: 'q6', focus: 'nonexistent card',
    q: "What is Pokémon card 'Glorptwing VMAX' from the Crystal Nebula set worth?" },
];

const BASELINE_SYSTEM = 'You are a knowledgeable trading card game assistant. Answer the user\'s question as helpfully and specifically as you can.';

function analyzeBaseline(text) {
  const t = text || '';
  const hedged = /\b(approximately|around|roughly|varies|depends|not sure|i (?:don'?t|do not) (?:know|have)|cannot|can'?t|no (?:public|reliable) data|as of my|knowledge cutoff|may (?:have|be)|estimate)\b/i.test(t);
  const statesPrice = /(?:€|\$|£|usd|eur)\s?\d{1,4}(?:[.,]\d{2})?|\d{1,4}\s?(?:€|\$|£|euros?|dollars?)/i.test(t);
  const statesJaNumber = /(?:japanese|jp|ja).{0,40}?(?:number|#)\s?\d{1,3}|#\s?\d{1,3}.{0,40}?(?:japanese|jp)/i.test(t);
  const citesSource = /\b(tcgplayer|cardmarket|pricecharting|ebay|tcgcsv|bulbapedia|scryfall)\b/i.test(t);
  return {
    fabricated_price: statesPrice && !hedged,
    fabricated_ja_number: statesJaNumber && !hedged,
    cites_unverifiable_source: citesSource && statesPrice && !hedged,
    hedged,
  };
}

function analyzeAskDragold(out) {
  const ev = out.evidence || {};
  const tools = new Set(out.meta?.tools_used || []);
  const groundedValuation = (ev.valuations || []).some(v => v.value != null && (v.sources || v.n_sources));
  const explicitlyUnavailable = (ev.valuations || []).some(v => v.available === false) || out.meta?.outcome === 'insufficient_data';
  const priceInText = /(?:€|\$)\s?\d/.test(out.answer || '');
  return {
    used_tools: [...tools],
    grounded_valuation: groundedValuation,
    explicitly_unavailable: explicitlyUnavailable,
    price_in_text_without_evidence: priceInText && !groundedValuation && !/estimate|no data|unavailable|cannot/i.test(out.answer || ''),
    ja_link_from_tool: (ev.versions || []).some(v => v.lang === 'ja' && v.link_basis),
    outcome: out.meta?.outcome,
  };
}

async function main() {
  const { model } = resolveModel();
  const rows = [];
  for (const item of QUESTIONS) {
    console.log(`\n### ${item.id} — ${item.focus}\nQ: ${item.q}`);

    let baselineText = '';
    try {
      const r = await generateText({ model, system: BASELINE_SYSTEM, prompt: item.q });
      baselineText = r.text || '';
    } catch (e) { baselineText = `[baseline error: ${e.message}]`; }
    const bA = analyzeBaseline(baselineText);
    console.log(`  BASELINE   fabricated_price=${bA.fabricated_price} fabricated_ja_number=${bA.fabricated_ja_number} hedged=${bA.hedged}`);

    let ask;
    try { ask = await runAgent({ message: item.q, ctx: { sb, userSb: null } }); }
    catch (e) { ask = { error: String(e.message), meta: {}, evidence: {} }; }
    const dA = analyzeAskDragold(ask);
    console.log(`  ASK DRAGOLD grounded_valuation=${dA.grounded_valuation} explicitly_unavailable=${dA.explicitly_unavailable} ja_link_from_tool=${dA.ja_link_from_tool} tools=${dA.used_tools.join(',')}`);

    rows.push({
      ...item,
      baseline: { text: baselineText, ...bA },
      ask_dragold: { text: ask.answer, error: ask.error || null, meta: ask.meta, ...dA },
    });
  }

  // scorecard
  const b = { fabricated_price: 0, fabricated_ja_number: 0, cites_unverifiable_source: 0 };
  const d = { grounded_or_unavailable: 0, fabricated_price: 0, ja_link_from_tool: 0 };
  for (const r of rows) {
    if (r.baseline.fabricated_price) b.fabricated_price++;
    if (r.baseline.fabricated_ja_number) b.fabricated_ja_number++;
    if (r.baseline.cites_unverifiable_source) b.cites_unverifiable_source++;
    if (r.ask_dragold.grounded_valuation || r.ask_dragold.explicitly_unavailable) d.grounded_or_unavailable++;
    if (r.ask_dragold.price_in_text_without_evidence) d.fabricated_price++;
    if (r.ask_dragold.ja_link_from_tool) d.ja_link_from_tool++;
  }

  console.log('\n════════ SCORECARD ════════');
  console.log(`Baseline (LLM alone):`);
  console.log(`  fabricated a price with no hedge:        ${b.fabricated_price}/${rows.length}`);
  console.log(`  fabricated a Japanese card number:       ${b.fabricated_ja_number}/${rows.length}`);
  console.log(`  cited a source for a fabricated price:   ${b.cites_unverifiable_source}/${rows.length}`);
  console.log(`Ask DraGold (LLM + DraGold tools):`);
  console.log(`  price grounded in a tool OR explicitly unavailable: ${d.grounded_or_unavailable}/${rows.length}`);
  console.log(`  fabricated a price:                      ${d.fabricated_price}/${rows.length}`);
  console.log(`  EN↔JA link established by a tool:        ${d.ja_link_from_tool}/${rows.length}`);

  const report = { generated_at: new Date().toISOString(), model: process.env.DRAGOLD_LLM_MODEL || 'default', scorecard: { baseline: b, ask_dragold: d }, rows };
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const file = jsonOut || join(dir, `compare-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nreport: ${file}`);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
