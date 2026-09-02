#!/usr/bin/env node
// DraGold — Market Valuation (Fase 2). Prezzi TCGCSV -> market_observations.
//
// Fonte: TCGCSV (TCGplayer market price, giornaliero, free). One Piece cat 68,
// Pokémon cat 3 (Task 8). Ogni run = un nuovo batch di osservazioni (append,
// storico), MAI upsert.
//
// Uso:
//   node scripts/ingest-market-tcgcsv.js --tcg=onepiece [--set=OP-17] [--since=2026-06-01] [--all] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { listTcgcsvGroups, listTcgcsvGroupCards, listTcgcsvGroupPrices, TCGCSV_CATEGORY } from './lib/catalog/sources/tcgcsv-catalog.js';
import { mapOnePieceGroups } from './lib/catalog/onepiece-groups.js';
import { normalizeSetCode } from './lib/catalog/normalize-set-code.js';
import { latestFxRate, insertObservations } from './lib/valuation/obs-store.js';
import { tcgcsvPriceToObservation } from './lib/valuation/observation-rows.js';
import { parseFrankfurter } from './lib/valuation/fx.js';

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const TCG = (val('tcg') || 'onepiece').toLowerCase();
const SETS = (val('set') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SINCE = val('since');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function usdRate() {
  const row = await latestFxRate(sb, 'USD');
  const today = new Date().toISOString().slice(0, 10);
  if (row && row.as_of === today) return row.rate;
  // fallback: fetch al volo (non scrive fx_rates — quello e' ingest-fx.js)
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', { signal: AbortSignal.timeout(15000) });
    const p = parseFrankfurter(await r.json());
    return p.rates.USD;
  } catch {
    if (row) return row.rate; // ultima nota
    throw new Error('nessun tasso USD disponibile (fx_rates vuota + Frankfurter irraggiungibile)');
  }
}

async function existingCardMap(cardIds) {
  const map = new Map();
  for (let i = 0; i < cardIds.length; i += 300) {
    const chunk = cardIds.slice(i, i + 300);
    const { data, error } = await sb.from('cards').select('id, canonical_card_id, tcg').in('id', chunk);
    if (error) throw new Error(`existingCardMap: ${error.message}`);
    for (const r of data || []) map.set(r.id, r);
  }
  return map;
}

async function runOnePiece(eurRate, capturedAt) {
  const groups = mapOnePieceGroups(await listTcgcsvGroups(TCGCSV_CATEGORY.onepiece));
  const want = new Set(SETS.map(normalizeSetCode));
  const selected = groups.filter((g) => {
    if (ALL) return true;
    if (want.size) return want.has(normalizeSetCode(g.setCode));
    if (SINCE) return g.publishedOn && g.publishedOn >= SINCE;
    return false;
  });
  if (!selected.length) throw new Error(`nessun group selezionato (set=${SETS} since=${SINCE} all=${ALL})`);

  let observations = 0, cardsMatched = 0, cardsMissing = 0;
  const perGroup = [];

  for (const g of selected) {
    const [products, priceMap] = await Promise.all([
      listTcgcsvGroupCards(TCGCSV_CATEGORY.onepiece, g.groupId),
      listTcgcsvGroupPrices(TCGCSV_CATEGORY.onepiece, g.groupId),
    ]);
    const cardIds = products.map((p) => `onepiece:tcgcsv:${p.productId}:en`);
    const cardMap = await existingCardMap(cardIds);

    const rows = [];
    for (const p of products) {
      const cardId = `onepiece:tcgcsv:${p.productId}:en`;
      const card = cardMap.get(cardId);
      if (!card) { cardsMissing++; continue; }
      cardsMatched++;
      for (const entry of priceMap.get(String(p.productId)) || []) {
        const obs = tcgcsvPriceToObservation({
          cardId, canonicalId: card.canonical_card_id || null, tcg: 'onepiece',
          priceEntry: entry, eurRate, capturedAt,
        });
        if (obs) rows.push(obs);
      }
    }

    if (!DRY_RUN && rows.length) await insertObservations(sb, rows);
    observations += rows.length;
    perGroup.push({ setCode: g.setCode, group: g.groupName, observations: rows.length, cards: cardMap.size });
    process.stderr.write(`  [${g.setCode}] ${rows.length} osservazioni (${cardMap.size}/${products.length} carte in DB)\n`);
  }

  return { observations, cardsMatched, cardsMissing, groups: selected.length, perGroup };
}

async function run() {
  const capturedAt = new Date().toISOString();
  const eurRate = await usdRate();
  process.stderr.write(`[ingest-market-tcgcsv] tcg=${TCG} eurRate(USD)=${eurRate}${DRY_RUN ? ' DRY-RUN' : ''}\n`);

  let report;
  if (TCG === 'onepiece') report = await runOnePiece(eurRate, capturedAt);
  else throw new Error(`tcg=${TCG} non ancora supportato (Pokémon = Task 8)`);

  console.log('INGEST_MARKET_REPORT=' + JSON.stringify({ dryRun: DRY_RUN, tcg: TCG, eurRate, ...report }));
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
