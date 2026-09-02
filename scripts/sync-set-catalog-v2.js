#!/usr/bin/env node
// DraGold — Set Catalog v2 (Fase 1).
// Popola `set_logos` (v2) da fonti autoritative:
//   Pokémon   -> TCGdex  (releaseDate + logo + symbol + cardCount + serie)
//   One Piece -> TCGCSV   (publishedOn come release date; niente logo)
//
// Upsert per (tcg, set_code_norm) con null-protection: non azzera
// logo_url/symbol_url/card_count esistenti se la fonte non li fornisce.
// A fine run: transizione automatica upcoming -> released per le date passate.
//
// Uso: node scripts/sync-set-catalog-v2.js [--only=pokemon|onepiece] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { listTcgdexSets } from './lib/catalog/sources/tcgdex-catalog.js';
import { listTcgcsvGroups, TCGCSV_CATEGORY } from './lib/catalog/sources/tcgcsv-catalog.js';
import { mapOnePieceGroups } from './lib/catalog/onepiece-groups.js';
import { normalizeSetCode } from './lib/catalog/normalize-set-code.js';
import { tcgdexSetToLogoRow, tcgcsvGroupToLogoRow } from './lib/catalog/set-logo-rows.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (args.find((a) => a.startsWith('--only='))?.split('=')[1] || '').trim();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const NOW = new Date().toISOString();

async function upsertLogoRows(tcg, rows) {
  const { data: existing } = await sb.from('set_logos').select('*').eq('tcg', tcg);
  const byKey = new Map((existing || []).map((r) => [normalizeSetCode(r.set_code), r]));
  let inserted = 0, updated = 0, skipped = 0;

  for (const row of rows) {
    const key = normalizeSetCode(row.set_code);
    if (!key) { skipped++; continue; }
    const prev = byKey.get(key);
    const payload = {
      ...row,
      // null-protection: mantieni gli asset gia' presenti se la fonte non li ha
      logo_url: row.logo_url ?? prev?.logo_url ?? null,
      symbol_url: row.symbol_url ?? prev?.symbol_url ?? null,
      card_count: row.card_count ?? prev?.card_count ?? null,
      updated_at: NOW,
    };
    if (DRY_RUN) { prev ? updated++ : inserted++; continue; }
    if (prev) {
      // preserva lo spelling di set_code gia' in DB (URL /set/:slug stabili)
      const { error } = await sb.from('set_logos').update({ ...payload, set_code: prev.set_code }).eq('tcg', tcg).eq('set_code', prev.set_code);
      if (error) throw new Error(`update set_logos ${tcg}/${row.set_code}: ${error.message}`);
      updated++;
    } else {
      const { error } = await sb.from('set_logos').insert(payload);
      if (error) throw new Error(`insert set_logos ${tcg}/${row.set_code}: ${error.message}`);
      inserted++;
    }
  }
  return { inserted, updated, skipped };
}

async function autoTransition() {
  if (DRY_RUN) return { transitioned: 0 };
  const { data, error } = await sb.from('set_logos')
    .update({ status: 'released', updated_at: NOW })
    .eq('status', 'upcoming')
    .lte('released_on', new Date().toISOString().slice(0, 10))
    .select('set_code');
  if (error) throw new Error(`autoTransition: ${error.message}`);
  return { transitioned: (data || []).length, codes: (data || []).map((r) => r.set_code) };
}

async function run() {
  const report = {};
  const errors = [];

  if (!ONLY || ONLY === 'pokemon') {
    try {
      process.stderr.write('[set-catalog] Pokémon (TCGdex)...\n');
      const sets = await listTcgdexSets('en', { withDetail: true });
      const rows = sets.map((s) => tcgdexSetToLogoRow(s));
      report.pokemon = await upsertLogoRows('pokemon', rows);
      process.stderr.write(`  ${JSON.stringify(report.pokemon)}\n`);
    } catch (e) {
      errors.push(`pokemon: ${e.message}`);
      process.stderr.write(`  [set-catalog] Pokémon SALTATO: ${e.message}\n`);
    }
  }

  if (!ONLY || ONLY === 'onepiece') {
    try {
      process.stderr.write('[set-catalog] One Piece (TCGCSV)...\n');
      const groups = await listTcgcsvGroups(TCGCSV_CATEGORY.onepiece);
      const rows = mapOnePieceGroups(groups).map((g) => tcgcsvGroupToLogoRow(g)).filter(Boolean);
      report.onepiece = await upsertLogoRows('onepiece', rows);
      process.stderr.write(`  ${JSON.stringify(report.onepiece)}\n`);
    } catch (e) {
      errors.push(`onepiece: ${e.message}`);
      process.stderr.write(`  [set-catalog] One Piece SALTATO: ${e.message}\n`);
    }
  }

  try {
    report.transition = await autoTransition();
    process.stderr.write(`[set-catalog] transition upcoming->released: ${JSON.stringify(report.transition)}\n`);
  } catch (e) {
    errors.push(`transition: ${e.message}`);
  }

  report.errors = errors;
  console.log('SYNC_SET_CATALOG_REPORT=' + JSON.stringify({ dryRun: DRY_RUN, ...report }));

  // Fallisce SOLO se non e' andato a buon fine NIENTE (tutte le fonti + la
  // transizione). Un errore transiente su una sola fonte non deve rompere il
  // workflow giornaliero.
  const anyOk = report.pokemon || report.onepiece || report.transition;
  if (!anyOk && errors.length) { console.error('FATAL: nessuna operazione riuscita'); process.exit(1); }
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
