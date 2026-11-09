/**
 * Provider Validation - CardSight AI
 * 
 * TEST REALE: 20 carte (10 Pokemon + 10 One Piece)
 * Confronta DraGold existing → CardSight AI pricing
 * 
 * CardSight AI:
 * - Free tier: 750 req/month, 4 req/sec
 * - API key: 0b625531b00f41ff8e77afc5372201d7
 * - X-API-Key header
 * - /v1/pricing/{card_id} → pricing data con eBay sold listings
 * - /v1/catalog/search?q={name} → ricerca carte
 * 
 * IMPORTANTE: JustTCG free tier si è esaurito (1000 req totali) — 
 * reset previsto domani. Non usare JustTCG finché non riavviato.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CARDSIGHT_KEY = '0b625531b00f41ff8e77afc5372201d7';
const CARDSIGHT = 'https://api.cardsight.ai';

// Mapping set_code DraGold → nome set CardSight
const SET_NAMES = {
  sv07: 'Stellar Crown',
  sv08: 'Stellar Crown',  // stesso set, diverse serie
  op01: 'Romance Dawn',
  op02: 'Paramount War',
  eb01: 'Black Maria',
  eb02: 'Bonney',
};

// === 20 CARTE ===
// Pokemon: prendi EN da SV07 e SV08 con numeretti specifici
// One Piece: prendi EN da OP-01, EB-01, EB-02

const POKEMON_TARGETS = [
  { set_id: 'sv07', card_number: '002', lang: 'en' },
  { set_id: 'sv07', card_number: '007', lang: 'en' },
  { set_id: 'sv07', card_number: '074', lang: 'en' },
  { set_id: 'sv07', card_number: '079', lang: 'en' },
  { set_id: 'sv07', card_number: '081', lang: 'en' },
  { set_id: 'sv07', card_number: '085', lang: 'en' },
  { set_id: 'sv07', card_number: '143', lang: 'en' },
  { set_id: 'sv07', card_number: '148', lang: 'en' },
  { set_id: 'sv07', card_number: '170', lang: 'en' },
  { set_id: 'sv08', card_number: '050', lang: 'en' },
];

const ONEPICE_TARGETS = [
  { set_id: 'OP-01', card_number: '002', lang: 'en' },
  { set_id: 'OP-01', card_number: '003', lang: 'en' },
  { set_id: 'OP-01', card_number: '045', lang: 'en' },
  { set_id: 'OP-01', card_number: '077', lang: 'en' },
  { set_id: 'EB-01', card_number: '016', lang: 'en' },
  { set_id: 'EB-02', card_number: '032', lang: 'en' },
  { set_id: 'EB-02', card_number: '033', lang: 'en' },
  { set_id: 'EB-02', card_number: '038', lang: 'en' },
  { set_id: 'EB-02', card_number: '047', lang: 'en' },
  { set_id: 'EB-02', card_number: '097', lang: 'en' },
];

async function getCards(targets) {
  const results = [];
  for (const t of targets) {
    const [setCode] = t.set_id.split('-');
    const res = await sb.from('cards')
      .select('id, name, set_id, card_number, lang, rarity, image_url')
      .eq('set_id', t.set_id)
      .eq('card_number', t.card_number)
      .eq('lang', t.lang)
      .single();
    
    if (res.data) {
      results.push({ ...res.data, dragoldId: res.data.id });
    } else {
      console.log(`NOT FOUND: ${t.set_id} #${t.card_number} ${t.lang}`);
    }
  }
  return results;
}

async function searchCardsight(name, setName) {
  const url = `${CARDSIGHT}/v1/catalog/search?q=${encodeURIComponent(name)}`;
  const resp = await fetch(url, {
    headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' }
  });
  if (resp.status !== 200) return null;
  
  const data = await resp.json();
  if (!data.results || data.results.length === 0) return null;
  
  // Cerca tra i risultati quello con setName corrispondente
  const matches = data.results.filter(r => 
    r.type === 'card' && r.setName && r.setName.toLowerCase() === setName.toLowerCase()
  );
  
  if (matches.length > 0) return matches[0];
  
  // Fallback: primo risultato card
  const firstCard = data.results.find(r => r.type === 'card');
  return firstCard || null;
}

async function getPricing(cardId) {
  const url = `${CARDSIGHT}/v1/pricing/${cardId}`;
  const resp = await fetch(url, {
    headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' }
  });
  if (resp.status !== 200) return null;
  return resp.json();
}

// === MAIN ===
async function main() {
  console.log('=== CARD SIGHT AI - PROVIDER VALIDATION ===\n');
  console.log('CardSight key: 0b625531b00f41ff8e77afc5372201d7');
  console.log('Plan: Free (750 req/month)\n');
  
  // 1. Recupera carte dal DB
  console.log('Fetching cards from DraGold DB...');
  const pokemonCards = await getCards(POKEMON_TARGETS);
  const opCards = await getCards(ONEPICE_TARGETS);
  const allCards = [...pokemonCards, ...opCards];
  
  console.log(`Found: ${pokemonCards.length} Pokemon + ${opCards.length} One Piece = ${allCards.length} total\n`);
  
  // 2. Per ogni carta, cerca in CardSight e prendi pricing
  const tableRows = [];
  
  for (const card of allCards) {
    const setCode = card.set_id.split('-')[0].toLowerCase();
    const setName = SET_NAMES[setCode] || card.set_id;
    const searchName = card.name;
    
    console.log(`--- ${card.name} (${card.set_id} #${card.card_number} ${card.lang}) ---`);
    
    // A. Cerca in CardSight
    const cardsightResult = await searchCardsight(searchName, setName);
    
    if (!cardsightResult) {
      console.log(`  CardSight: NOT FOUND (search: "${searchName}", setName: "${setName}")`);
      tableRows.push({
        card: card.name,
        set: card.set_id,
        number: card.card_number,
        lang: card.lang,
        draGoldPrice: 'N/A',
        cardsightId: null,
        cardsightMatch: false,
        cardsightPrice: null,
        cardsightObservations: 0,
        cardsightRange: null,
        cardsightAsOf: null,
        source: 'N/A'
      });
      continue;
    }
    
    const cardsightId = cardsightResult.id;
    console.log(`  CardSight: found ID ${cardsightId}, setName="${cardsightResult.setName}", cardNumber=${cardsightResult.cardNumber || 'N/A'}`);
    
    // B. Prendi pricing
    const pricing = await getPricing(cardsightId);
    
    if (!pricing) {
      console.log(`  CardSight Pricing: NOT AVAILABLE`);
      tableRows.push({
        card: card.name,
        set: card.set_id,
        number: card.card_number,
        lang: card.lang,
        draGoldPrice: 'N/A',
        cardsightId,
        cardsightMatch: true,
        cardsightPrice: null,
        cardsightObservations: 0,
        cardsightRange: null,
        cardsightAsOf: null,
        source: 'CardSight (no pricing)'
      });
      continue;
    }
    
    const obs = pricing.raw?.count || 0;
    const records = pricing.raw?.records || [];
    
    // Calcola min/max price
    let minPrice = Infinity, maxPrice = -Infinity;
    for (const r of records) {
      if (r.price < minPrice) minPrice = r.price;
      if (r.price > maxPrice) maxPrice = r.price;
    }
    
    console.log(`  CardSight Pricing:`);
    console.log(`    Observations: ${obs}`);
    console.log(`    Range: $${minPrice === Infinity ? 'N/A' : minPrice} - $${maxPrice === -Infinity ? 'N/A' : maxPrice}`);
    console.log(`    As of: ${pricing.query?.as_of_date || 'N/A'}`);
    console.log(`    Sample records (first 3):`);
    for (const r of records.slice(0, 3)) {
      console.log(`      - $${r.price} on ${r.date?.substring(0,10) || 'N/A'} (${r.source}, ${r.listing_type || 'N/A'})${r.url ? ', URL: ' + r.url : ''}`);
    }
    
    // C. Confronta con DraGold
    const { data: priceRes } = await sb.from('card_prices')
      .select('price_market, currency, source, captured_at')
      .eq('card_id', card.id)
      .single();
    
    const draGoldPrice = priceRes?.price_market != null 
      ? `${priceRes.currency} ${priceRes.price_market.toFixed(2)} (${priceRes.source}, ${new Date(priceRes.captured_at).toISOString().substring(0,10)})`
      : 'NO DATA';
    
    console.log(`  DraGold: ${draGoldPrice}`);
    
    tableRows.push({
      card: card.name,
      set: card.set_id,
      number: card.card_number,
      lang: card.lang,
      draGoldPrice,
      cardsightId,
      cardsightMatch: true,
      cardsightPrice: records.length > 0 ? records[0].price : null,
      cardsightObservations: obs,
      cardsightRange: minPrice === Infinity ? null : `${minPrice}-${maxPrice}`,
      cardsightAsOf: pricing.query?.as_of_date || null,
      source: 'CardSight AI'
    });
    
    console.log('');
  }
  
  // === TABLA RIASSUNTIVA ===
  console.log('\n=== RIASSUNTIVO 20 CARTE ===\n');
  console.log('| # | Card | Set | DraGold | CardSight | Obs | Range | AsOf |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (let i = 0; i < tableRows.length; i++) {
    const r = tableRows[i];
    console.log(`| ${i+1} | ${r.card} | ${r.set} #${r.number} (${r.lang}) | ${r.draGoldPrice} | ${r.cardsightPrice != null ? '$'+r.cardsightPrice : 'NO'} | ${r.cardsightObservations} | ${r.cardsightRange || 'N/A'} | ${r.cardsightAsOf || 'N/A'} |`);
  }
  
  // === SALVA RISULTATI ===
  const { writeFile } = await import('fs/promises');
  await writeFile('cardSightResults.json', JSON.stringify(tableRows, null, 2));
  console.log('\nSaved to cardSightResults.json');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
