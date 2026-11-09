#!/usr/bin/env node
/**
 * Sync Pokemon prices with Pokémon TCG API
 * Uses POKEMONTCG_API_KEY from environment or passed explicitly
 * 20k req/day = 8 days for 162k cards
 * Batch 20 cards per call, 100ms delay between calls
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');

// Config from environment
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const pokemonApiKey = process.env.POKEMONTCG_API_KEY || '';

if (!supabaseUrl || !supabaseKey || !pokemonApiKey) {
  console.error('ERROR: Missing required env vars');
  console.error('  SUPABASE_URL:', supabaseUrl ? 'OK' : 'MISSING');
  console.error('  SUPABASE_SERVICE_KEY:', supabaseKey ? '[REDACTED]' : 'MISSING');
  console.error('  POKEMONTCG_API_KEY:', pokemonApiKey ? '[REDACTED]' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';
const BATCH_SIZE = 20;
const DELAY_MS = 100;

console.log('=== SYNC POKEMON PRICES WITH POKEMONTCG API ===');
console.log(`  API Key: ${pokemonApiKey.substring(0, 8)}...`);
console.log(`  Batch size: ${BATCH_SIZE}`);
console.log(`  Delay: ${DELAY_MS}ms`);
console.log('');

async function fetchCardPrices(cardId) {
  // Parse card_id: pokemon:tcgdex:sv07-010:en → setCode=sv07, cardNumber=010
  const parts = cardId.split(':');
  const setCode = parts[2]?.split('-')[0];
  const cardNumber = parts[2]?.split('-')[1];

  if (!setCode || !cardNumber) return null;

  // Query: setCode + number (campo card number dell'API)
  const url = `${POKEMONTCG_API}?pageSize=1&q=${encodeURIComponent(`setCode:${setCode}+number:${cardNumber}`)}`;

  const response = await fetch(url, {
    headers: { 'X-API-Key': pokemonApiKey }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (!data.data || data.data.length === 0) {
    return null;
  }

  const card = data.data[0];
  return {
    tcgplayer: card.tcgplayer?.prices,
    cardmarket: card.cardmarket?.prices,
    updatedAt: card.tcgplayer?.updatedAt || card.cardmarket?.updatedAt
  };
}

async function syncBatch(cardIds) {
  let success = 0;
  let fail = 0;

  for (const cardId of cardIds) {
    const parts = cardId.split(':');
    const setCode = parts[2]?.split('-')[0];
    const cardNumber = parts[2]?.split('-')[1];

    if (!setCode || !cardNumber) {
      fail++;
      continue;
    }

    const prices = await fetchCardPrices(setCode, cardNumber);

    if (!prices) {
      fail++;
      await new Promise(r => setTimeout(r, DELAY_MS));
      continue;
    }

    const tcgplayerMarket = prices.tcgplayer?.market ||
                            prices.tcgplayer?.lowPrice ||
                            prices.tcgplayer?.midPrice ||
                            null;

    const cardmarketAvg = prices.cardmarket?.averageSellPrice ||
                         prices.cardmarket?.avg ||
                         null;

    const records = [];

    if (tcgplayerMarket !== null && isFinite(tcgplayerMarket)) {
      records.push({
        card_id: cardId,
        source: 'tcgplayer',
        currency: 'USD',
        price_market: Math.round(tcgplayerMarket * 100) / 100,
        raw_response: JSON.stringify({ tcgplayer: prices.tcgplayer }),
        captured_at: new Date().toISOString()
      });
    }

    if (cardmarketAvg !== null && isFinite(cardmarketAvg)) {
      records.push({
        card_id: cardId,
        source: 'cardmarket',
        currency: 'EUR',
        price_market: Math.round(cardmarketAvg * 100) / 100,
        raw_response: JSON.stringify({ cardmarket: prices.cardmarket }),
        captured_at: new Date().toISOString()
      });
    }

    for (const record of records) {
      const { data: existing, error: checkError } = await supabase
        .from('card_prices')
        .select('id')
        .eq('card_id', record.card_id)
        .eq('source', record.source)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.log(`  Error checking ${cardId}: ${checkError.message}`);
        fail++;
        break;
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('card_prices')
          .update(record)
          .eq('id', existing.id);

        if (updateError) {
          console.log(`  Error updating ${cardId}: ${updateError.message}`);
          fail++;
          break;
        }
      } else {
        const { error: insertError } = await supabase
          .from('card_prices')
          .insert(record);

        if (insertError) {
          console.log(`  Error inserting ${cardId}: ${insertError.message}`);
          fail++;
          break;
        }
      }
    }

    success++;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return { success, fail };
}

async function getCardsToSync(offset = 0, limit = 10000) {
  const { data, error } = await supabase
    .from('cards')
    .select('id')
    .eq('tcg', 'pokemon')
    .range(offset, offset + limit - 1);

  if (error) {
    console.log(`Error fetching cards: ${error.message}`);
    return [];
  }

  return data || [];
}

async function main() {
  const startId = parseInt(process.env.START_ID || '0');
  const maxCards = parseInt(process.env.MAX_CARDS || '1000');
  const maxBatches = parseInt(process.env.MAX_BATCHES || '50');

  console.log(`  Start ID: ${startId}`);
  console.log(`  Max cards: ${maxCards}`);
  console.log(`  Max batches: ${maxBatches}`);
  console.log('');

  const cards = await getCardsToSync(startId, maxCards);

  if (cards.length === 0) {
    console.log('No cards to sync');
    return;
  }

  console.log(`Cards to sync: ${cards.length}`);
  console.log('');

  let totalSuccess = 0;
  let totalFail = 0;
  let batchCount = 0;

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    batchCount++;
    if (batchCount > maxBatches) {
      console.log(`\nMax batches (${maxBatches}) reached`);
      break;
    }

    const batch = cards.slice(i, i + BATCH_SIZE);
    const startPos = startId + i;
    const endPos = startId + i + batch.length - 1;

    console.log(`Batch ${batchCount}/${maxBatches} (pos ${startPos}-${endPos})...`);
    const result = await syncBatch(batch.map(c => c.id));
    totalSuccess += result.success;
    totalFail += result.fail;
    console.log(`  → ${result.success} success, ${result.fail} fail`);
  }

  console.log('');
  console.log('=== RESULTS ===');
  console.log(`  Total cards processed: ${cards.length}`);
  console.log(`  Success: ${totalSuccess}`);
  console.log(`  Fail: ${totalFail}`);
  console.log(`  Next start ID: ${startId + cards.length}`);
  console.log(`  Success rate: ${(totalSuccess / (totalSuccess + totalFail) * 100).toFixed(1)}%`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
