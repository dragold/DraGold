#!/usr/bin/env node
/**
 * DraGold — read-only verification of the cross-language layer. No writes.
 *   set -a && source .env.local && set +a && node scripts/verify-cross-language.mjs [--json=out.json]
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY required'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const SAMPLE = [
  { tcg: 'pokemon', set_id: 'sv03.5', card_number: '006', label: 'Charizard ex — 151 006' },
  { tcg: 'pokemon', set_id: 'sv03.5', card_number: '199', label: '151 199 (SIR)' },
  { tcg: 'pokemon', set_id: 'SV2a',   card_number: '006', label: 'リザードンex — JA 151 006' },
  { tcg: 'pokemon', set_id: 'sv08',   card_number: '100', label: 'Surging Sparks 100 (no JA alias yet)' },
  { tcg: 'pokemon', set_id: 'SV1a',   card_number: '010', label: 'SV1a 010 (candidate/partial — must NOT link)' },
  { tcg: 'onepiece', set_id: 'OP-01', card_number: 'OP01-001', label: 'One Piece OP-01 001' },
];

async function main() {
  const jsonOut = process.argv.find(a => a.startsWith('--json='))?.split('=')[1] || null;
  const report = { generated_at: new Date().toISOString(), samples: [] };

  const { data: sa } = await sb.from('set_alias').select('confidence,relation');
  report.coverage = {
    set_alias_total: (sa || []).length,
    set_alias_confirmed_equivalent: (sa || []).filter(r => r.confidence === 'confirmed' && r.relation === 'equivalent').length,
    set_alias_candidate: (sa || []).filter(r => r.confidence === 'candidate').length,
  };
  console.log('coverage:', JSON.stringify(report.coverage), '\n');

  let bad = 0;
  for (const q of SAMPLE) {
    const { data, error } = await sb.rpc('card_versions', { p_tcg: q.tcg, p_set_id: q.set_id, p_card_number: q.card_number });
    const rows = data || [];
    const langs = [...new Set(rows.map(r => r.lang))].sort();
    const bases = [...new Set(rows.map(r => r.link_basis))].sort();
    const keys = [...new Set(rows.map(r => r.xlang_key))];
    report.samples.push({ ...q, error: error?.message || null, n: rows.length, langs, link_bases: bases, xlang_keys: keys });
    console.log(`${q.label.padEnd(44)} n=${String(rows.length).padStart(3)}  langs=[${langs}]  basis=[${bases}]`);
    if (error) { console.error(`  !! error: ${error.message}`); bad++; }
    if (keys.length > 1) { console.error(`  !! ${keys.length} distinct xlang_key — BUG`); bad++; }
  }

  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(bad === 0 ? '\nOK — every sample resolved to exactly one concept.' : `\nFAIL — ${bad} problem(s).`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch(e => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
