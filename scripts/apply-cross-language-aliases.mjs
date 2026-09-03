#!/usr/bin/env node
/**
 * DraGold — applica il seed cross-language (data/cross-language/*.json) alle
 * tabelle set_alias / card_number_alias. Idempotente. dry-run di default.
 *
 *   node scripts/apply-cross-language-aliases.mjs [--apply] [--json=out.json]
 * Env: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data', 'cross-language');

const RELATIONS = ['equivalent', 'subset', 'superset', 'partial'];

/** Validazioni bloccanti (spec §3.4). Pura. */
export function validateSeed(setAliases, numberAliases) {
  const errors = [];
  const sa = setAliases || [], na = numberAliases || [];

  for (const r of sa) {
    if (r.alias_set_id === r.canonical_set_id)
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: alias_set_id == canonical_set_id`);
    if (r.confidence === 'confirmed' && !(r.note && r.note.trim().length >= 10))
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: confirmed requires a note (>=10 chars)`);
    if (!RELATIONS.includes(r.relation))
      errors.push(`set_alias ${r.tcg}/${r.alias_set_id}: bad relation ${r.relation}`);
  }
  // self-ref: un set non è sia alias che canonical per lo stesso tcg
  for (const r of sa) {
    if (sa.some(o => o.tcg === r.tcg && o.alias_set_id === r.canonical_set_id))
      errors.push(`set_alias ${r.tcg}/${r.canonical_set_id}: is both a canonical and an alias (self-ref)`);
  }
  // dup unique (tcg, alias_set_id)
  const seen = new Set();
  for (const r of sa) {
    const k = `${r.tcg}|${r.alias_set_id}`;
    if (seen.has(k)) errors.push(`set_alias duplicate (tcg, alias_set_id): ${k}`);
    seen.add(k);
  }

  for (const r of na) {
    if (r.confidence === 'confirmed' && !(r.note && r.note.trim().length >= 10))
      errors.push(`card_number_alias ${r.tcg}/${r.alias_set_id}/${r.alias_card_number}: confirmed requires a note`);
  }
  // 1:1 in entrambe le direzioni
  const fwd = new Set(), rev = new Set();
  for (const r of na) {
    const f = `${r.tcg}|${r.alias_set_id}|${r.alias_card_number}`;
    const b = `${r.tcg}|${r.canonical_set_id}|${r.alias_set_id}|${r.canonical_card_number}`;
    if (fwd.has(f)) errors.push(`card_number_alias duplicate forward key: ${f}`);
    if (rev.has(b)) errors.push(`card_number_alias many-to-one (reverse key): ${b}`);
    fwd.add(f); rev.add(b);
  }
  return { ok: errors.length === 0, errors };
}

/** Diff puro per idempotenza/report. */
export function planUpserts(seedRows, dbRows, keyCols) {
  const key = (r) => keyCols.map(c => r[c]).join('|');
  const dbByKey = new Map((dbRows || []).map(r => [key(r), r]));
  const compareCols = Object.keys((seedRows || [])[0] || {}).filter(c => !['id', 'created_at', 'updated_at'].includes(c));
  const insert = [], update = [], unchanged = [];
  for (const s of seedRows || []) {
    const d = dbByKey.get(key(s));
    if (!d) insert.push(s);
    else if (compareCols.some(c => String(s[c] ?? '') !== String(d[c] ?? ''))) update.push(s);
    else unchanged.push(s);
  }
  return { insert, update, unchanged };
}

function stripMeta(r) { const { id, created_at, updated_at, $schema, ...rest } = r; return rest; }

async function main() {
  const APPLY = process.argv.includes('--apply');
  const jsonOut = process.argv.find(a => a.startsWith('--json='))?.split('=')[1] || null;

  const setSeed = JSON.parse(readFileSync(join(DATA, 'set-aliases.json'), 'utf8')).aliases || [];
  const numSeed = JSON.parse(readFileSync(join(DATA, 'card-number-aliases.json'), 'utf8')).aliases || [];

  const v = validateSeed(setSeed, numSeed);
  if (!v.ok) {
    console.error('SEED VALIDATION FAILED:\n' + v.errors.map(e => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`[apply-cross-language-aliases] ${APPLY ? 'APPLY' : 'DRY-RUN'} — set_alias ${setSeed.length}, card_number_alias ${numSeed.length}`);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: dbSet } = await sb.from('set_alias').select('*');
  const { data: dbNum } = await sb.from('card_number_alias').select('*');

  const setPlan = planUpserts(setSeed, dbSet || [], ['tcg', 'alias_set_id']);
  const numPlan = planUpserts(numSeed, dbNum || [], ['tcg', 'alias_set_id', 'alias_card_number']);

  console.log(`  set_alias:  insert ${setPlan.insert.length}, update ${setPlan.update.length}, unchanged ${setPlan.unchanged.length}`);
  console.log(`  card_number_alias: insert ${numPlan.insert.length}, update ${numPlan.update.length}, unchanged ${numPlan.unchanged.length}`);

  const report = { generated_at: new Date().toISOString(), apply: APPLY, sanity: [] };
  for (const a of setSeed.filter(x => x.confidence === 'confirmed')) {
    const { count: cAlias } = await sb.from('cards').select('id', { count: 'exact', head: true }).eq('tcg', a.tcg).eq('set_id', a.alias_set_id);
    const { count: cCanon } = await sb.from('cards').select('id', { count: 'exact', head: true }).eq('tcg', a.tcg).eq('set_id', a.canonical_set_id);
    report.sanity.push({ alias: `${a.tcg}/${a.alias_set_id}→${a.canonical_set_id}`, rows_on_alias: cAlias, rows_on_canonical: cCanon });
    console.log(`  sanity ${a.tcg}/${a.alias_set_id}→${a.canonical_set_id}: ${cAlias} alias rows, ${cCanon} canonical rows`);
    if (!cAlias) console.warn(`  WARN: ${a.tcg}/${a.alias_set_id} matches 0 cards rows — check the set code`);
  }

  if (APPLY) {
    if (setPlan.insert.length || setPlan.update.length) {
      const { error } = await sb.from('set_alias').upsert(
        [...setPlan.insert, ...setPlan.update].map(stripMeta), { onConflict: 'tcg,alias_set_id' });
      if (error) { console.error('set_alias upsert:', error.message); process.exit(1); }
    }
    if (numPlan.insert.length || numPlan.update.length) {
      const { error } = await sb.from('card_number_alias').upsert(
        [...numPlan.insert, ...numPlan.update].map(stripMeta), { onConflict: 'tcg,alias_set_id,alias_card_number' });
      if (error) { console.error('card_number_alias upsert:', error.message); process.exit(1); }
    }
    console.log('  applied.');
  }

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
