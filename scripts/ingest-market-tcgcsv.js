#!/usr/bin/env node
// DraGold — Market Valuation (Fase 2). Prezzi TCGCSV -> market_observations.
//
// Fonte: TCGCSV (TCGplayer market price, giornaliero, free). One Piece cat 68,
// Pokémon cat 3. Ogni run = un nuovo batch di osservazioni (append, storico),
// MAI upsert. MAI un match forzato: i prodotti non risolti sono contati e loggati.
//
// Uso:
//   node scripts/ingest-market-tcgcsv.js --tcg=onepiece [--set=OP-17] [--since=2026-06-01] [--all] [--dry-run]
//   node scripts/ingest-market-tcgcsv.js --tcg=pokemon --since=2024-01-01 [--all] [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { listTcgcsvGroups, listTcgcsvGroupCards, listTcgcsvGroupPrices, TCGCSV_CATEGORY } from './lib/catalog/sources/tcgcsv-catalog.js';
import { mapOnePieceGroups } from './lib/catalog/onepiece-groups.js';
import { listTcgdexSets } from './lib/catalog/sources/tcgdex-catalog.js';
import { normalizeSetCode } from './lib/catalog/normalize-set-code.js';
import { rawSetIdCandidates } from './lib/catalog/db-read.js';
import { latestFxRate, insertObservations } from './lib/valuation/obs-store.js';
import { tcgcsvPriceToObservation } from './lib/valuation/observation-rows.js';
import { parseFrankfurter } from './lib/valuation/fx.js';
import {
  buildPokemonSetIndex, resolvePokemonSetId, tcgcsvNumberToLocalId, cardNumberNorm,
  buildCardIndexForSets, resolveCardIdFromIndex,
} from './lib/valuation/card-match.js';

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
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', { signal: AbortSignal.timeout(15000) });
    return parseFrankfurter(await r.json()).rates.USD;
  } catch {
    if (row) return row.rate;
    throw new Error('nessun tasso USD disponibile');
  }
}

async function existingCardMap(cardIds) {
  const map = new Map();
  for (let i = 0; i < cardIds.length; i += 300) {
    const { data, error } = await sb.from('cards').select('id, canonical_card_id').in('id', cardIds.slice(i, i + 300));
    if (error) throw new Error(`existingCardMap: ${error.message}`);
    for (const r of data || []) map.set(r.id, r);
  }
  return map;
}

function priceObsFor(cardId, canonicalId, tcg, priceEntries, eurRate, capturedAt) {
  const out = [];
  for (const entry of priceEntries || []) {
    const o = tcgcsvPriceToObservation({ cardId, canonicalId, tcg, priceEntry: entry, eurRate, capturedAt });
    if (o) out.push(o);
  }
  return out;
}

// ── One Piece ─────────────────────────────────────────────────────────────────
async function runOnePiece(eurRate, capturedAt) {
  const groups = mapOnePieceGroups(await listTcgcsvGroups(TCGCSV_CATEGORY.onepiece));
  const want = new Set(SETS.map(normalizeSetCode));
  const selected = groups.filter((g) => ALL || (want.size ? want.has(normalizeSetCode(g.setCode)) : (SINCE && g.publishedOn && g.publishedOn >= SINCE)));
  if (!selected.length) throw new Error(`nessun group selezionato (set=${SETS} since=${SINCE} all=${ALL})`);

  let observations = 0, matchedExact = 0, matchedByNumber = 0, unresolved = 0;
  const perGroup = [];

  for (const g of selected) {
    const [products, priceMap] = await Promise.all([
      listTcgcsvGroupCards(TCGCSV_CATEGORY.onepiece, g.groupId),
      listTcgcsvGroupPrices(TCGCSV_CATEGORY.onepiece, g.groupId),
    ]);
    const synthIds = products.map((p) => `onepiece:tcgcsv:${p.productId}:en`);
    const setCandidates = rawSetIdCandidates(g.setCode);
    const [exactMap, numIndex] = await Promise.all([
      existingCardMap(synthIds),
      buildCardIndexForSets(sb, 'onepiece', setCandidates),
    ]);

    const rows = [];
    let gExact = 0, gNum = 0, gUnres = 0;
    for (const p of products) {
      const synthId = `onepiece:tcgcsv:${p.productId}:en`;
      const entries = priceMap.get(String(p.productId)) || [];
      if (!entries.length) continue;

      const exact = exactMap.get(synthId);
      if (exact) {
        rows.push(...priceObsFor(synthId, exact.canonical_card_id || null, 'onepiece', entries, eurRate, capturedAt));
        gExact++; continue;
      }
      if (!p.number) { gUnres++; continue; }
      const cid = resolveCardIdFromIndex(numIndex, cardNumberNorm(p.number));
      if (cid) { rows.push(...priceObsFor(cid, null, 'onepiece', entries, eurRate, capturedAt)); gNum++; }
      else gUnres++;
    }

    if (!DRY_RUN && rows.length) await insertObservations(sb, rows);
    observations += rows.length; matchedExact += gExact; matchedByNumber += gNum; unresolved += gUnres;
    perGroup.push({ setCode: g.setCode, group: g.groupName, observations: rows.length, exact: gExact, byNumber: gNum, unresolved: gUnres });
    process.stderr.write(`  [${g.setCode}] ${rows.length} obs · exact ${gExact} · byNum ${gNum} · unresolved ${gUnres}\n`);
  }
  return { groups: selected.length, observations, matchedExact, matchedByNumber, unresolved, perGroup };
}

// ── Pokémon ───────────────────────────────────────────────────────────────────
async function runPokemon(eurRate, capturedAt) {
  const authIds = new Set((await listTcgdexSets('en', { withDetail: false })).map((s) => String(s.code).toLowerCase()));
  const setIndex = await buildPokemonSetIndex(sb, authIds);

  const groups = await listTcgcsvGroups(TCGCSV_CATEGORY.pokemon);
  const want = new Set(SETS.map((s) => s.toLowerCase()));
  const selected = groups.filter((g) => {
    if (ALL) return true;
    if (want.size) return want.has(String(g.abbreviation || '').toLowerCase()) || want.has(String(g.name || '').toLowerCase());
    return SINCE && g.publishedOn && g.publishedOn >= SINCE;
  });
  if (!selected.length) throw new Error(`nessun group Pokémon selezionato (set=${SETS} since=${SINCE} all=${ALL})`);

  let observations = 0, matched = 0, unresolvedSet = 0, unresolvedCard = 0;
  const perGroup = [];
  const skippedSets = [];

  for (const g of selected) {
    const { setId, reason } = resolvePokemonSetId(setIndex, g.name);
    if (!setId) { unresolvedSet++; skippedSets.push(`${g.name} (${reason})`); continue; }
    const [products, priceMap, numIndex] = await Promise.all([
      listTcgcsvGroupCards(TCGCSV_CATEGORY.pokemon, g.groupId),
      listTcgcsvGroupPrices(TCGCSV_CATEGORY.pokemon, g.groupId),
      buildCardIndexForSets(sb, 'pokemon', rawSetIdCandidates(setId)),
    ]);

    const rows = [];
    let gMatch = 0, gUnres = 0;
    for (const p of products) {
      const entries = priceMap.get(String(p.productId)) || [];
      if (!entries.length || !p.number) { if (!p.number) gUnres++; continue; }
      const cid = resolveCardIdFromIndex(numIndex, cardNumberNorm(tcgcsvNumberToLocalId(p.number)));
      if (cid) { rows.push(...priceObsFor(cid, null, 'pokemon', entries, eurRate, capturedAt)); gMatch++; }
      else gUnres++;
    }

    if (!DRY_RUN && rows.length) await insertObservations(sb, rows);
    observations += rows.length; matched += gMatch; unresolvedCard += gUnres;
    perGroup.push({ setId, group: g.name, observations: rows.length, matched: gMatch, unresolved: gUnres });
    process.stderr.write(`  [${setId}] ${g.name}: ${rows.length} obs · matched ${gMatch} · unresolved ${gUnres}\n`);
  }
  return { groups: selected.length, observations, matched, unresolvedSet, unresolvedCard, skippedSets: skippedSets.slice(0, 40), perGroup };
}

async function run() {
  const capturedAt = new Date().toISOString();
  const eurRate = await usdRate();
  process.stderr.write(`[ingest-market-tcgcsv] tcg=${TCG} eurRate(USD)=${eurRate}${DRY_RUN ? ' DRY-RUN' : ''}\n`);

  let report;
  if (TCG === 'onepiece') report = await runOnePiece(eurRate, capturedAt);
  else if (TCG === 'pokemon') report = await runPokemon(eurRate, capturedAt);
  else throw new Error(`tcg=${TCG} non supportato`);

  console.log('INGEST_MARKET_REPORT=' + JSON.stringify({ dryRun: DRY_RUN, tcg: TCG, eurRate, ...report }));
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
