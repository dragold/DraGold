#!/usr/bin/env node
// DraGold — Ingestion One Piece EN, SOURCE-DRIVEN da TCGCSV (Fase 1).
//
// Nessuna lista di set hardcoded: la lista dei set viene SEMPRE da
// listTcgcsvGroups(68). Un nuovo set/promo upstream diventa sincronizzabile
// senza toccare il codice.
//
// Scrive: `cards` (id namespaced 'onepiece:tcgcsv:<productId>:en' — non
// collide con le righe optcg esistenti) e `card_prices` (source 'tcgcsv',
// currency USD — la valutazione/conversione e' Fase 2).
//
// Uso:
//   node scripts/sync-onepiece.js --set=OP-17[,OP-18]   # set specifici (canonici)
//   node scripts/sync-onepiece.js --since=2026-06-01     # group con publishedOn >= data
//   node scripts/sync-onepiece.js --all                  # tutti i group
//   node scripts/sync-onepiece.js --set=OP-17 --dry-run
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import {
  listTcgcsvGroups, listTcgcsvGroupCards, listTcgcsvGroupPrices, TCGCSV_CATEGORY,
} from './lib/catalog/sources/tcgcsv-catalog.js';
import { mapOnePieceGroups } from './lib/catalog/onepiece-groups.js';
import { normalizeSetCode } from './lib/catalog/normalize-set-code.js';
import { tcgcsvProductToCardRow, tcgcsvPriceToPriceRow } from './lib/catalog/onepiece-rows.js';

const CARD_BATCH = 100;
const PRICE_BATCH = 200;

/**
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string[]} [opts.sets] - set canonici (es. ['OP-17'])
 * @param {string} [opts.since] - ISO date; group con publishedOn >= since
 * @param {boolean} [opts.all]
 * @param {boolean} [opts.dryRun]
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{groupsProcessed:number, cardsUpserted:number, pricesUpserted:number, perGroup:object[]}>}
 */
export async function runOnePieceSync({ supabase, sets, since, all, dryRun = false, log = () => {} } = {}) {
  const capturedAt = new Date().toISOString();
  const groups = await listTcgcsvGroups(TCGCSV_CATEGORY.onepiece);
  const mapped = mapOnePieceGroups(groups);

  const wantCodes = new Set((sets || []).map(normalizeSetCode).filter(Boolean));
  const selected = mapped.filter((m) => {
    if (all) return true;
    if (wantCodes.size) return wantCodes.has(normalizeSetCode(m.setCode));
    if (since) return m.publishedOn && m.publishedOn >= since;
    return false;
  });

  if (!selected.length) {
    throw new Error(`sync-onepiece: nessun group selezionato (sets=${JSON.stringify(sets)} since=${since} all=${all}). Group disponibili: ${mapped.length}`);
  }

  let cardsUpserted = 0, pricesUpserted = 0;
  const perGroup = [];

  for (const g of selected) {
    log(`[${g.setCode}] ${g.groupName} (group ${g.groupId})...`);
    const [products, priceMap] = await Promise.all([
      listTcgcsvGroupCards(TCGCSV_CATEGORY.onepiece, g.groupId),
      listTcgcsvGroupPrices(TCGCSV_CATEGORY.onepiece, g.groupId),
    ]);

    const cardRows = [];
    const priceRows = [];
    for (const p of products) {
      const row = tcgcsvProductToCardRow({ product: p, groupName: g.groupName, setCode: g.setCode, capturedAt });
      if (!row) continue; // sealed / non-carta
      cardRows.push(row);
      const priceRow = tcgcsvPriceToPriceRow({
        cardId: row.id,
        priceEntries: priceMap.get(String(p.productId)) || [],
        printVariant: row.print_variant,
        capturedAt,
      });
      if (priceRow) priceRows.push(priceRow);
    }

    if (!dryRun) {
      for (let i = 0; i < cardRows.length; i += CARD_BATCH) {
        const { error } = await supabase.from('cards')
          .upsert(cardRows.slice(i, i + CARD_BATCH), { onConflict: 'id', ignoreDuplicates: false });
        if (error) throw new Error(`upsert cards [${g.setCode}]: ${error.message}`);
      }
      // card_prices ha FK card_id -> cards(id): le carte sono gia' scritte sopra.
      for (let i = 0; i < priceRows.length; i += PRICE_BATCH) {
        const { error } = await supabase.from('card_prices').insert(priceRows.slice(i, i + PRICE_BATCH));
        if (error) throw new Error(`insert card_prices [${g.setCode}]: ${error.message}`);
      }
    }

    cardsUpserted += cardRows.length;
    pricesUpserted += priceRows.length;
    perGroup.push({ setCode: g.setCode, group: g.groupName, cards: cardRows.length, prices: priceRows.length, entityType: g.entityType });
    log(`  ${cardRows.length} carte, ${priceRows.length} prezzi${dryRun ? ' (dry-run)' : ''}`);
  }

  return { groupsProcessed: selected.length, cardsUpserted, pricesUpserted, perGroup, dryRun };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function isMain() {
  try { return import.meta.url === new URL(`file://${process.argv[1]}`).href || process.argv[1]?.endsWith('sync-onepiece.js'); }
  catch { return false; }
}

if (isMain()) {
  const args = process.argv.slice(2);
  const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  runOnePieceSync({
    supabase,
    sets: (val('set') || '').split(',').map((s) => s.trim()).filter(Boolean),
    since: val('since'),
    all: args.includes('--all'),
    dryRun: args.includes('--dry-run'),
    log: (m) => process.stderr.write(m + '\n'),
  })
    .then((r) => { console.log('SYNC_ONEPIECE_REPORT=' + JSON.stringify(r)); })
    .catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
}
