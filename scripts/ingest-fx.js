#!/usr/bin/env node
// DraGold — Market Valuation (Fase 2). Cambio EUR giornaliero da Frankfurter (BCE).
// Uso: node scripts/ingest-fx.js [--quotes=USD,GBP] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { parseFrankfurter } from './lib/valuation/fx.js';
import { upsertFxRate } from './lib/valuation/obs-store.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const QUOTES = (args.find((a) => a.startsWith('--quotes='))?.split('=')[1] || 'USD').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const FRANKFURTER = process.env.FRANKFURTER_BASE || 'https://api.frankfurter.app';

async function run() {
  const res = await fetch(`${FRANKFURTER}/latest?from=EUR&to=${QUOTES.join(',')}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const parsed = parseFrankfurter(await res.json());

  const rows = QUOTES
    .filter((q) => Number.isFinite(parsed.rates[q]))
    .map((q) => ({ as_of: parsed.date, quote: q, rate: parsed.rates[q], source: 'frankfurter' }));

  if (!rows.length) throw new Error(`nessun tasso valido per ${QUOTES.join(',')} in ${JSON.stringify(parsed.rates)}`);

  if (!DRY_RUN) {
    const supabase = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    if (!process.env.SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY richiesto');
    for (const r of rows) await upsertFxRate(supabase, r);
  }

  console.log('INGEST_FX_REPORT=' + JSON.stringify({ dryRun: DRY_RUN, as_of: parsed.date, rates: Object.fromEntries(rows.map((r) => [r.quote, r.rate])) }));
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
