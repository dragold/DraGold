#!/usr/bin/env node
// DraGold — Market Valuation (Fase 2). market_observations -> market_valuations.
//
// Per ogni carta con >=1 osservazione recente calcola: estimated_value,
// observed low/median/high, n_observations, n_sources, trend, confidence
// (spiegabile). Upsert su (card_id, currency).
//
// Uso:
//   node scripts/compute-valuations.js [--tcg=onepiece] [--card-id=<id>] [--since-days=120] [--limit=N] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { cardIdsWithRecentObservations, observationsForCards } from './lib/valuation/obs-store.js';
import { loadPriorValuations, upsertValuations } from './lib/valuation/valuation-store.js';
import { computeValuation } from './lib/valuation/valuation.js';

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const DRY_RUN = args.includes('--dry-run');
const TCG = val('tcg') || null;
const CARD_ID = val('card-id') || null;
const SINCE_DAYS = Number(val('since-days') || 120);
const LIMIT = val('limit') ? Number(val('limit')) : null;
const CURRENCY = 'EUR';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function run() {
  const now = new Date();

  let targets;
  if (CARD_ID) {
    const { data } = await sb.from('cards').select('id, canonical_card_id, tcg').eq('id', CARD_ID);
    targets = (data || []).map((c) => ({ card_id: c.id, canonical_card_id: c.canonical_card_id, tcg: c.tcg }));
  } else {
    targets = await cardIdsWithRecentObservations(sb, SINCE_DAYS, TCG);
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);
  process.stderr.write(`[compute-valuations] ${targets.length} carte da valutare\n`);

  const byConfidence = { high: 0, medium: 0, low: 0, none: 0 };
  let valued = 0;
  const sample = [];

  for (let i = 0; i < targets.length; i += 200) {
    const chunk = targets.slice(i, i + 200);
    const ids = chunk.map((t) => t.card_id);
    const obsMap = await observationsForCards(sb, ids, 90);
    const priorMap = await loadPriorValuations(sb, ids, CURRENCY);

    const rows = chunk.map((t) => computeValuation({
      cardId: t.card_id,
      canonicalId: t.canonical_card_id || null,
      tcg: t.tcg,
      currency: CURRENCY,
      observations: obsMap.get(t.card_id) || [],
      prior: priorMap.get(t.card_id) || null,
      now,
    }));

    for (const r of rows) {
      byConfidence[r.confidence] = (byConfidence[r.confidence] || 0) + 1;
      if (r.estimated_value != null) valued++;
      if (sample.length < 20) sample.push({ card_id: r.card_id, est: r.estimated_value, band: r.confidence, score: r.confidence_score, trend30: r.trend_30d_pct, n: r.n_observations, src: r.n_sources });
    }

    if (!DRY_RUN) await upsertValuations(sb, rows);
    process.stderr.write(`  ${Math.min(i + 200, targets.length)}/${targets.length}\n`);
  }

  console.log('COMPUTE_VALUATIONS_REPORT=' + JSON.stringify({ dryRun: DRY_RUN, cards: targets.length, valued, byConfidence, sample }));
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
