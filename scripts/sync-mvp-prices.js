/**
 * DraGold — Sync prezzi per i 6 set MVP
 * 
 * Fonte: TCGdex card endpoint (VERIFIED per SV07, SV08)
 *   - Pokémon: price_market (avg Cardmarket EUR), currency EUR, source tcgdex, captured_at
 *   - One Piece: usa prezzi esistenti nel DB (optcg), non fetcha nuovi (no API key)
 * 
 * Uso:
 *   node scripts/sync-mvp-prices.js                    # tutti i 6 set
 *   node scripts/sync-mvp-prices.js --set=sv07,sv08   # solo pokemon
 *   node scripts/sync-mvp-prices.js --dry-run         # senza INSERT
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

const args = process.argv.slice(2);
const argSet = args.find(a => a.startsWith('--set='))?.split('=')[1]?.split(',').map(s => s.trim()).filter(Boolean) || null;
const DRY_RUN = args.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Sets da processare
const sets = [
  { tcg: 'pokemon', setId: 'sv07', useTcgdex: true },
  { tcg: 'pokemon', setId: 'sv08', useTcgdex: true },
  { tcg: 'onepiece', setId: 'OP-01', useTcgdex: false },
  { tcg: 'onepiece', setId: 'OP-02', useTcgdex: false },
  { tcg: 'onepiece', setId: 'EB-01', useTcgdex: false },
  { tcg: 'onepiece', setId: 'EB-02', useTcgdex: false },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchTcgdexCard(setId, cardNumber) {
  const padded = String(cardNumber).padStart(3, '0');
  const url = `${TCGDEX_BASE}/en/cards/${setId}-${padded}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'DraGold-Sync/1.0', 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function upsertPrice(cardId, priceMarket, currency, source, capturedAt) {
  // card_prices_latest è una VIEW — inseriamo in card_prices
  const { data: existing, error: existingErr } = await supabase
    .from('card_prices')
    .select('id, captured_at')
    .eq('card_id', cardId)
    .eq('source', source)
    .order('captured_at', { ascending: false })
    .limit(1);
  
  if (existingErr) {
    console.log(`  ERRORE esistente: ${existingErr.message}`);
    return false;
  }
  
  if (existing && existing.length > 0) {
    console.log(`  Price already exists for ${cardId} (source ${source}, captured ${existing[0].captured_at}) — skipping`);
    return false;
  }
  
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] INSERT price: cardId=${cardId}, price=${priceMarket}, currency=${currency}, source=${source}, captured=${capturedAt}`);
    return true;
  }
  
  const { error } = await supabase.from('card_prices').insert({
    card_id: cardId,
    price_market: priceMarket,
    currency: currency,
    source: source,
    captured_at: capturedAt || new Date().toISOString(),
    timeframe: null,
    price_median: null,
  });
  
  if (error) {
    if (error.code === '23505') {
      console.log(`  Duplicate skip: ${cardId} ${source}`);
      return false;
    }
    console.log(`  ERRORE insert: ${error.message}`);
    return false;
  }
  
  console.log(`  INSERT: ${cardId} = ${priceMarket} ${currency} (${source})`);
  return true;
}

async function syncSet(setInfo) {
  const { tcg, setId, useTcgdex } = setInfo;
  console.log(`\n=== ${tcg.toUpperCase()} / ${setId} ${useTcgdex ? '(TCGdex)' : '(existing)'} ===`);
  
  // Recupera tutte le carte EN per questo set
  const { data: cards, error: cardsErr } = await supabase
    .from('cards')
    .select('id, card_number, name, image_url, lang')
    .eq('tcg', tcg)
    .eq('set_id', setId)
    .eq('lang', 'en');
  
  if (cardsErr) {
    console.log(`  ERROR: ${cardsErr.message}`);
    return;
  }
  
  if (!cards || cards.length === 0) {
    console.log(`  No cards found for ${setId}`);
    return;
  }
  
  console.log(`  ${cards.length} cards found`);
  
  let fetched = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const card of cards) {
    if (useTcgdex) {
      // Pokémon: fetcha da TCGdex
      const tcgdexId = `${setId}-${String(card.card_number).padStart(3, '0')}`;
      const data = await fetchTcgdexCard(setId, card.card_number);
      
      if (!data || !data.pricing) {
        skipped++;
        console.log(`  [${card.card_number}] ${data ? 'no pricing' : 'not found'} — skip`);
        await sleep(150);
        continue;
      }
      
      const pricing = data.pricing;
      const cm = pricing.cardmarket;
      const tp = pricing.tcgplayer;
      
      let price = null;
      let currency = null;
      let captured = null;
      
      // Preferisci Cardmarket EUR
      if (cm && cm.avg != null && cm.avg > 0) {
        price = cm.avg;
        currency = 'EUR';
        captured = cm.updated || new Date().toISOString();
      } else if (tp) {
        const tpData = tp.holofoil || tp.normal || tp.reverse;
        if (tpData && tpData.marketPrice != null && tpData.marketPrice > 0) {
          price = tpData.marketPrice;
          currency = 'USD';
          captured = tpData.productId ? (tp.updated || new Date().toISOString()) : new Date().toISOString();
        }
      }
      
      if (price != null) {
        const ok = await upsertPrice(card.id, price, currency, 'tcgdex', captured);
        if (ok) fetched++;
      } else {
        skipped++;
        console.log(`  [${card.card_number}] ${card.name}: no valid price (cm=${cm?.avg ?? 'N/A'}, tp=${tp ? 'HAS' : 'NO'})`);
      }
    } else {
      // One Piece: usa prezzi esistenti nel DB
      const { data: existingPrices, error: existingErr } = await supabase
        .from('card_prices')
        .select('id, price_market, currency, source, captured_at')
        .eq('card_id', card.id)
        .order('captured_at', { ascending: false })
        .limit(1);
      
      if (existingErr) {
        console.log(`  [${card.card_number}] ERRORE DB: ${existingErr.message}`);
        errors++;
        continue;
      }
      
      if (existingPrices && existingPrices.length > 0) {
        const p = existingPrices[0];
        if (p.price_market != null) {
          console.log(`  [${card.card_number}] ${card.name}: ${p.price_market} ${p.currency} [${p.source} @ ${p.captured_at}] (existing)`);
          fetched++;
        } else {
          console.log(`  [${card.card_number}] ${card.name}: existing row but no price`);
          skipped++;
        }
      } else {
        console.log(`  [${card.card_number}] ${card.name}: NO PRICE (no optcg API key)`);
        skipped++;
      }
    }
  }
  
  console.log(`  Done: ${fetched} fetched, ${skipped} skipped, ${errors} errors`);
  return { fetched, skipped, errors };
}

async function main() {
  console.log('🃏  DraGold — Sync prezzi per i 6 set MVP');
  console.log(`   Dry-run: ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`   Sets: ${argSet ? argSet.join(', ') : 'all 6 (sv07, sv08, OP-01, OP-02, EB-01, EB-02)'}`);
  
  const setsToProcess = argSet
    ? sets.filter(s => argSet.includes(s.setId))
    : sets;
  
  let totalFetched = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  for (const setInfo of setsToProcess) {
    const result = await syncSet(setInfo);
    if (result) {
      totalFetched += result.fetched;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log(`✅  Sync completato`);
  console.log(`   Fetched: ${totalFetched}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Errors: ${totalErrors}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY-RUN MODE — no INSERT performed');
  }
}

main().catch(err => {
  console.error('❌  Errore critico:', err.message);
  process.exit(1);
});
