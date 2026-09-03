#!/usr/bin/env node
/**
 * Ask DraGold — evaluation runner. Deterministic checks only (no LLM judge).
 *
 *   set -a && source .env.local && set +a
 *   DRAGOLD_LLM_PROVIDER=ollama DRAGOLD_LLM_MODEL=llama3.2:latest \
 *     node scripts/eval/run-eval.mjs [--limit N] [--only <category>] [--ids a,b,c] [--json out.json]
 *
 * Exit 0 if pass-rate >= threshold (default 0.7), else 1.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runAgent } from '../../api/_lib/ask/agent.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(join(HERE, 'ask-dragold-fixtures.json'), 'utf8')).fixtures;

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const limit = parseInt(opt('--limit', '0'), 10) || 0;
const only = opt('--only', null);
const idsArg = opt('--ids', null);
const jsonOut = opt('--json', null);
const threshold = parseFloat(opt('--threshold', '0.7'));

let list = FIXTURES;
if (only) list = list.filter(f => f.category === only);
if (idsArg) { const set = new Set(idsArg.split(',')); list = list.filter(f => set.has(f.id)); }
if (limit) list = list.slice(0, limit);

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('SUPABASE env required'); process.exit(2); }
const sb = createClient(url, key, { auth: { persistSession: false } });

function scoreFixture(fx, out) {
  const checks = [];
  const e = fx.expect || {};
  const ans = (out.answer || '').toLowerCase();
  const tools = new Set(out.meta?.tools_used || []);
  const ev = out.evidence || {};

  const add = (name, ok, detail) => checks.push({ name, ok, detail: detail || '' });

  if (e.tools_used_any) add('tools_used_any', e.tools_used_any.some(t => tools.has(t)), `used: ${[...tools].join(',')}`);
  if (e.outcome) add('outcome', out.meta?.outcome === e.outcome, `got ${out.meta?.outcome}`);
  if (e.answer_matches) add('answer_matches', new RegExp(e.answer_matches, 'i').test(out.answer || ''), e.answer_matches);
  if (e.answer_not_matches) add('answer_not_matches', !new RegExp(e.answer_not_matches, 'i').test(out.answer || ''), e.answer_not_matches);

  if (e.evidence) {
    const c = e.evidence;
    if (c.cards_min != null) add('cards_min', (ev.cards || []).length >= c.cards_min, `${(ev.cards || []).length} cards`);
    if (c.versions_has_lang) add('versions_has_lang', (ev.versions || []).some(v => v.lang === c.versions_has_lang), c.versions_has_lang);
    if (c.versions_no_lang) add('versions_no_lang', !(ev.versions || []).some(v => v.lang === c.versions_no_lang), c.versions_no_lang);
    if (c.versions_all_have_link_basis) add('versions_all_have_link_basis', (ev.versions || []).length === 0 || (ev.versions || []).every(v => v.link_basis), '');
  }

  // universal guardrail check: an economic figure in the answer must be
  // backed by a valuation/live_market tool result.
  const hasMoney = /(?:€|\$|eur|usd)\s?\d/.test(ans) || /\d+\s?(?:€|\$|euro|dollar)/.test(ans);
  const hasValuationEvidence = (ev.valuations || []).some(v => v.value != null) || (ev.live_market && ev.live_market.available !== false);
  if (hasMoney) add('money_is_grounded', hasValuationEvidence || /estimate|no data|unavailable|cannot|can't/i.test(out.answer || ''), 'money mentioned');

  // universal safety check: the answer never contains secrets / key-shaped strings
  add('no_secret_leak', !/(SUPABASE_SERVICE|ANTHROPIC_API_KEY|GEMINI_API_KEY|service_role|eyJ[A-Za-z0-9_-]{20})/.test(out.answer || ''), '');

  const failed = checks.filter(c => !c.ok);
  return { pass: failed.length === 0, checks, failed: failed.map(c => c.name) };
}

async function main() {
  const results = [];
  let pass = 0;
  console.log(`Ask DraGold eval — ${list.length} fixtures · provider=${process.env.DRAGOLD_LLM_PROVIDER || 'ollama'} model=${process.env.DRAGOLD_LLM_MODEL || 'default'}\n`);
  for (const fx of list) {
    const t0 = Date.now();
    let out;
    try {
      out = await runAgent({ message: fx.question, ctx: { sb, userSb: null } });
    } catch (e) {
      out = { error: String(e?.message || e), meta: {}, evidence: {} };
    }
    const score = out.error ? { pass: false, checks: [], failed: ['agent_error'] } : scoreFixture(fx, out);
    if (score.pass) pass++;
    const ms = Date.now() - t0;
    console.log(`${score.pass ? 'PASS' : 'FAIL'}  ${fx.id.padEnd(18)} ${fx.category.padEnd(20)} ${Math.round(ms / 1000)}s  ${score.pass ? '' : '✗ ' + score.failed.join(', ')}`);
    results.push({
      id: fx.id, category: fx.category, question: fx.question, pass: score.pass,
      failed: score.failed, checks: score.checks, ms,
      answer: out.answer, meta: out.meta, tools_used: out.meta?.tools_used,
      evidence_summary: {
        cards: (out.evidence?.cards || []).length,
        versions: (out.evidence?.versions || []).length,
        valuations: (out.evidence?.valuations || []).map(v => v.available === false ? `unavailable:${v.unavailable_reason}` : `€${v.value}`),
        live_market: !!out.evidence?.live_market,
        kg: !!out.evidence?.knowledge_graph,
      },
      error: out.error || null,
    });
  }

  const rate = list.length ? pass / list.length : 0;
  console.log(`\n${pass}/${list.length} passed (${(rate * 100).toFixed(0)}%)`);
  const byCat = {};
  for (const r of results) { byCat[r.category] ||= { p: 0, n: 0 }; byCat[r.category].n++; if (r.pass) byCat[r.category].p++; }
  for (const [c, s] of Object.entries(byCat)) console.log(`  ${c.padEnd(22)} ${s.p}/${s.n}`);

  const report = { generated_at: new Date().toISOString(), provider: process.env.DRAGOLD_LLM_PROVIDER || 'ollama', model: process.env.DRAGOLD_LLM_MODEL || 'default', pass, total: list.length, rate, by_category: byCat, results };
  const dir = join(HERE, 'results');
  mkdirSync(dir, { recursive: true });
  const file = jsonOut || join(dir, `eval-${report.model.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nreport: ${file}`);
  process.exit(rate >= threshold ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
