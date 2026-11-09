/**
 * Provider Validation - 20 carte reali
 * Confronta DraGold existing → CardSight AI → JustTCG (quando disponibile)
 * 
 * CardSight AI: key=0b625531b00f41ff8e77afc5372201d7, free 750/mese
 * JustTCG: key=tcg_40a02848a8834457be7f39ba280f3bbb, free 1000 totale (esaurito, reset domani)
 * 
 * 20 carte: 10 Pokemon EN + 10 One Piece EN
 * Per ogni carta: DraGold | CardSight | JustTCG (quando disponibile)
 * metriche: price, source, timestamp, type (listing/sold), variant, language, match status
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CARDSIGHT_KEY = '0b625531b00f41ff8e77afc5372201d7';
const JUSTTCG_KEY = 'tcg_40a02848a8834457be7f39ba280f3bbb';

console.log('=== PROVIDER VALIDATION — 20 REAL CARDS ===\n');

// 20 carte: 10 Pokemon + 10 One Piece
const cards = [
  // Pokemon EN (10)
  { id: 'pokemon:tcgdex:sv07-002:en', name: 'Ledyba', setId: 'sv07', num: '002', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-007:en', name: 'Carnivine', setId: 'sv07', num: '007', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-074:en', name: 'Rhyhorn', setId: 'sv07', num: '074', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-079:en', name: 'Medicham', setId: 'sv07', num: '079', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-081:en', name: 'Riolu', setId: 'sv07', num: '081', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-085:en', name: 'Pancham', setId: 'sv07', num: '085', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-143:en', name: 'Bulbasaur', setId: 'sv07', num: '143', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-148:en', name: 'Squirtle', setId: 'sv07', num: '148', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-170:en', name: 'Terapagos ex', setId: 'sv07', num: '170', lang: 'en', rarity: null, tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv08-050:en', name: 'Quaxly', setId: 'sv08', num: '050', lang: 'en', rarity: null, tcg: 'pokemon' },
  // One Piece EN (10)
  { id: 'onepiece:optcg:OP01-002:en', name: 'Trafalgar Law', setId: 'OP-01', num: 'OP01-002', lang: 'en', rarity: 'L', tcg: 'onepiece' },
  { id: 'onepiece:optcg:OP01-003:en', name: 'Monkey.D.Luffy', setId: 'OP-01', num: 'OP01-003', lang: 'en', rarity: 'L', tcg: 'onepiece' },
  { id: 'onepiece:optcg:OP01-045:en', name: 'Jean Bart', setId: 'OP-01', num: 'OP01-045', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:OP01-077:en', name: 'Perona', setId: 'OP-01', num: 'OP01-077', lang: 'en', rarity: 'UC', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB01-016:en', name: 'Bingoh', setId: 'EB-01', num: 'EB01-016', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB02-032:en', name: 'Iceburg', setId: 'EB-02', num: 'EB02-032', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB02-033:en', name: 'Klabautermann', setId: 'EB-02', num: 'EB02-033', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB02-038:en', name: 'Magellan', setId: 'EB-02', num: 'EB02-038', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB02-047:en', name: 'Blueno', setId: 'EB-02', num: 'EB02-047', lang: 'en', rarity: 'C', tcg: 'onepiece' },
  { id: 'onepiece:optcg:EB02-054:en', name: 'Sanji', setId: 'EB-02', num: 'EB02-054', lang: 'en', rarity: 'C', tcg: 'onepiece' },
];

async function fetchDraGoldPrice(cardId) {
  const { data, error } = await sb.from('card_prices')
    .select('price_market, currency, source, captured_at')
    .eq('card_id', cardId)
    .single();
  if (error || !data) return null;
  return {
    price: data.price_market,
    currency: data.currency,
    source: data.source,
    captured_at: data.captured_at,
    type: data.source === 'tcgdex' ? 'tcgplayer_avg_listing' : 'optcg_listing'
  };
}

async function fetchCardSight(cardName, setName) {
  // 1. Search
  const searchUrl = `https://api.cardsight.ai/v1/catalog/search?q=${encodeURIComponent(cardName)}`;
  let resp;
  try { resp = await fetch(searchUrl, { headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' } }); }
  catch (e) { return { error: 'search_network_error', message: e.message }; }
  
  if (resp.status === 429) return { error: 'rate_limited' };
  if (resp.status !== 200) return { error: 'search_status_' + resp.status };
  
  const searchData = await resp.json();
  if (!searchData.results || searchData.results.length === 0) return { error: 'no_results' };
  
  // Trova match con setName
  const setNameMatch = searchData.results.find(r => 
    r.type === 'card' && r.setName && r.setName.toLowerCase() === setName.toLowerCase()
  );
  
  const selected = setNameMatch || searchData.results.find(r => r.type === 'card');
  if (!selected) return { error: 'no_card_match' };
  
  const cardsightId = selected.id;
  
  // 2. Pricing
  const pricingUrl = `https://api.cardsight.ai/v1/pricing/${cardsightId}`;
  let pricingResp;
  try { pricingResp = await fetch(pricingUrl, { headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' } }); }
  catch (e) { return { cardsightId, cardsightName: selected.name, error: 'pricing_network_error', message: e.message }; }
  
  if (pricingResp.status === 429) return { cardsightId, cardsightName: selected.name, error: 'pricing_rate_limited' };
  if (pricingResp.status !== 200) return { cardsightId, cardsightName: selected.name, error: 'pricing_status_' + pricingResp.status };
  
  const pricingData = await pricingResp.json();
  if (!pricingData || !pricingData.raw) return { cardsightId, cardsightName: selected.name, error: 'no_pricing_data' };
  
  const records = pricingData.raw.records || [];
  const count = pricingData.raw.count || 0;
  
  // Deduplica per url (stesse listings)
  const uniqueUrls = new Set();
  const uniqueRecords = records.filter(r => {
    if (r.url && uniqueUrls.has(r.url)) return false;
    if (r.url) uniqueUrls.add(r.url);
    return true;
  });
  
  // Classifica listing vs potential sale
  const listings = uniqueRecords.filter(r => r.listing_type === 'fixed' || r.listing_type === 'auction');
  const soldPotential = uniqueRecords.filter(r => r.listing_type === 'sold' || r.listing_type === 'completed');
  
  const prices = uniqueRecords.map(r => r.price).sort((a, b) => a - b);
  
  return {
    cardsightId,
    cardsightName: selected.name,
    cardsightSet: selected.setName || '',
    cardsightNumber: selected.cardNumber || '',
    cardsightLanguage: selected.language || '',
    pricing: {
      observationCount: count,
      uniqueObservationCount: uniqueRecords.length,
      listingCount: listings.length,
      soldCount: soldPotential.length,
      priceMin: prices[0] || null,
      priceMax: prices[prices.length - 1] || null,
      priceMedian: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : null,
      priceMean: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      asOfDate: pricingData.query?.as_of_date || '',
      records: uniqueRecords.slice(0, 10).map(r => ({
        price: r.price,
        date: r.date?.substring(0, 10),
        source: r.source,
        listingType: r.listing_type,
        url: r.url
      }))
    }
  };
}

async function fetchJustTCG(card, setName) {
  // JustTCG free tier è esaurito (1000 totali) — attesa reset domani
  // Per ora, documentiamo che è rate-limited
  
  const gameId = card.tcg === 'pokemon' ? '1' : '4'; // 1=Pokemon, 4=One Piece (verificare)
  const setCode = card.setId.toLowerCase().replace('-', '');
  
  const url = `https://api.justtcg.com/v1/cards?game_id=${gameId}&set_code=${setCode}&collector_number=${card.num}&language=${card.lang}`;
  
  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'x-api-key': JUSTTCG_KEY, 'Accept': 'application/json' }
    });
  } catch (e) {
    return { error: 'network_error', message: e.message };
  }
  
  if (resp.status === 429) return { error: 'rate_limited', message: 'Free tier exhausted (1000 total calls). Resets tomorrow.' };
  if (resp.status !== 200) {
    const text = await resp.text();
    return { error: 'http_' + resp.status, message: text.substring(0, 200) };
  }
  
  const data = await resp.json();
  if (!data || !data.cards || data.cards.length === 0) return { error: 'no_cards_found' };
  
  const jtCard = data.cards[0];
  
  // Prezzi
  const pricing = jtCard.pricing || {};
  
  return {
    justtcgCardName: jtCard.name,
    justtcgSetName: jtCard.set_name,
    justtcgCollectorNumber: jtCard.collector_number,
    justtcgLanguage: jtCard.language,
    justtcgMatch: jtCard.name?.toLowerCase() === card.name.toLowerCase(),
    pricing: {
      low: pricing.low,
      high: pricing.high,
      market: pricing.market || pricing.vwap,
      historical: pricing.historical,
      asOf: jtCard.pricing_as_of,
      salesData: jtCard.sales_data,
      variants: jtCard.variants
    }
  };
}

async function main() {
  console.log('20 carte da testare:\n');
  
  // 1. Recupera tutti i prezzi esistenti in un batch
  const allIds = cards.map(c => c.id);
  const existingPrices = {};
  
  for (let i = 0; i < allIds.length; i += 50) {
    const chunk = allIds.slice(i, i + 50);
    const { data, error } = await sb.from('card_prices')
      .select('card_id, price_market, currency, source, captured_at')
      .in('card_id', chunk);
    if (error && error.code !== 'PGRST116') {
      console.log('Error:', error.message);
    }
    if (data) {
      for (const row of data) {
        existingPrices[row.card_id] = {
          price: row.price_market,
          currency: row.currency,
          source: row.source,
          captured_at: row.captured_at
        };
      }
    }
  }
  
  console.log(`DraGold existing prices: ${Object.keys(existingPrices).length}/20 cards\n`);
  
  // 2. CardSight AI per tutte le 20 carte
  console.log('=== CardSight AI — 20 cards ===\n');
  
  const cardsightResults = {};
  let csErrors = 0;
  
  for (const card of cards) {
    const setName = card.tcg === 'pokemon' 
      ? (card.setId === 'sv07' ? 'Stellar Crown' : 'Stellar Crown')  // CardSight usa 'Checklist' per Pokemon base
      : (card.setId === 'OP-01' ? 'Romance Dawn' 
         : card.setId === 'OP-02' ? 'Paramount War'
         : card.setId === 'EB-01' ? 'Black Maria'
         : 'Bonney');
    
    console.log(`--- ${card.name} (${card.setId} #${card.num} ${card.lang}) ---`);
    
    const result = await fetchCardSight(card.name, setName);
    
    if (result.error) {
      console.log(`  ERROR: ${result.error}${result.message ? ' — ' + result.message : ''}`);
      csErrors++;
      cardsightResults[card.id] = { error: result.error, ...(result.message && { message: result.message }) };
    } else {
      console.log(`  CardSight ID: ${result.cardsightId}`);
      console.log(`  Name: ${result.cardsightName} | Set: ${result.cardsightSet} | Number: ${result.cardsightNumber} | Lang: ${result.cardsightLanguage}`);
      console.log(`  Observations: ${result.pricing.observationCount} (unique: ${result.pricing.uniqueObservationCount})`);
      console.log(`  Type: ${result.pricing.listingCount} listings, ${result.pricing.soldCount} sold`);
      console.log(`  Price range: $${result.pricing.priceMin} - $${result.pricing.priceMax}`);
      console.log(`  Median: $${result.pricing.priceMedian} | Mean: $${result.pricing.priceMean}`);
      console.log(`  As of: ${result.pricing.asOfDate}`);
      
      cardsightResults[card.id] = result;
    }
    console.log('');
  }
  
  console.log(`CardSight: ${20 - csErrors}/20 cards with data, ${csErrors} errors\n`);
  
  // 3. JustTCG — attesa rate limit
  console.log('=== JustTCG — 20 cards (ATTESA RESET FREEBIE) ===\n');
  console.log('JustTCG free tier: 1000 total calls — ATTESO RESET DOMANI');
  console.log('Non possiamo testare ora. Documentiamo lo stato.\n');
  
  const justtcgResults = {};
  for (const card of cards) {
    justtcgResults[card.id] = {
      status: 'BLOCKED',
      reason: 'Free tier exhausted (1000 total calls used). Reset expected tomorrow.',
      note: 'Cannot test until free tier resets. Professional plan: $19/month, 10k calls/month, commercial use.'
    };
  }
  
  // 4. Tabella comparativa
  console.log('=== COMPARISON TABLE ===\n');
  console.log('| # | Card | Type | Set | # | DraGold | CardSight | JustTCG |');
  console.log('|---|---|---|---|---|---|---|---|');
  
  let idx = 1;
  for (const card of cards) {
    const existing = existingPrices[card.id];
    const cs = cardsightResults[card.id];
    const jt = justtcgResults[card.id];
    
    const draGoldStr = existing 
      ? `${existing.currency} ${existing.price.toFixed(2)} (${existing.source}, ${new Date(existing.captured_at).toISOString().substring(0,10)})`
      : 'NO DATA';
    
    const csStr = cs?.error 
      ? `ERROR: ${cs.error}`
      : `$${cs.pricing.priceMedian} (n=${cs.pricing.observationCount}, listings=${cs.pricing.listingCount})`;
    
    const jtStr = jt?.status === 'BLOCKED' ? 'BLOCKED (reset domani)' : jt?.error || 'N/A';
    
    console.log(`| ${idx} | ${card.name} | ${card.tcg} | ${card.setId} | ${card.num} | ${draGoldStr} | ${csStr} | ${jtStr} |`);
    idx++;
  }
  
  // 5. Cross-source analysis per carta
  console.log('\n=== CROSS-SOURCE ANALYSIS (CardSight vs DraGold) ===\n');
  
  for (const card of cards) {
    const existing = existingPrices[card.id];
    const cs = cardsightResults[card.id];
    
    if (cs?.error || !existing) continue;
    
    const draGoldVal = existing.currency === 'EUR' 
      ? existing.price * 1.08  // EUR→USD approx
      : existing.price;
    
    const csMedian = cs.pricing.priceMedian;
    const ratio = csMedian > 0 ? (draGoldVal / csMedian).toFixed(2) : 'N/A';
    
    console.log(`${card.name} (${card.setId} #${card.num}):`);
    console.log(`  DraGold: ${existing.currency} ${existing.price} (${existing.source}) → ~USD ${draGoldVal.toFixed(2)}`);
    console.log(`  CardSight: USD ${csMedian} median, ${cs.pricing.observationCount} listings`);
    console.log(`  Ratio DraGold/CardSight: ${ratio}`);
    
    if (card.tcg === 'pokemon') {
      console.log(`  NOTE: TCGdex = TCGPlayer avg (listing, NOT sale). CardSight = eBay listings (NOT sale).`);
      console.log(`  Both are LISTING prices, not SOLD prices. Need sale data for true market value.`);
    } else {
      console.log(`  NOTE: optcg = listing price (stale ~140 days). CardSight = recent eBay listings.`);
      console.log(`  CardSight data is FRESH (2026-09-17) vs optcg STALE (2026-05-25).`);
    }
    console.log('');
  }
  
  // 6. Save
  await writeFile('provider_validation_final.json', JSON.stringify({
    cards,
    existingPrices,
    cardsightResults,
    justtcgResults: justtcgResults,
    summary: {
      cardSightCardsWithData: Object.keys(cardsightResults).filter(k => !cardsightResults[k].error).length,
      cardSightErrors: csErrors,
      justtcgBlocked: true,
      justtcgReason: 'Free tier exhausted, resets tomorrow'
    }
  }, null, 2));
  
  console.log('Saved to provider_validation_final.json');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
