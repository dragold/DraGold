/**
 * Provider Validation - JUSTTCG + CARDSIGHT AI
 * 20 cards: 10 Pokemon EN + 10 One Piece EN
 * 
 * CardSight: 50 calls (search + pricing per card) — 700 left on free tier
 * JustTCG: 40 calls (card lookup per card) — 960 left on free tier  
 * 
 * Cards da testare:
 * 
 * Pokemon (10 EN):
 * 1. SV07 #002 Ledyba / Coxy (fr)
 * 2. SV07 #007 Carnivine / Fluval (fr)
 * 3. SV07 #074 Rhyhorn / Révéil (fr)
 * 4. SV07 #079 Medicham / Meditazione (fr)
 * 5. SV07 #081 Riolu / Riolu (fr)
 * 6. SV07 #085 Pancham / Pandespiègle (fr)
 * 7. SV07 #143 Bulbasaur / Bulbizarre (fr)
 * 8. SV07 #148 Squirtle / Carapuce (fr)
 * 9. SV07 #170 Terapagos ex / Terapagos ex (fr)
 * 10. SV08 #050 Quaxly / Quaxly (pt)
 * 
 * One Piece (10 EN):
 * 11. OP-01 #OP01-002 Trafalgar Law
 * 12. OP-01 #OP01-003 Monkey.D.Luffy
 * 13. OP-01 #OP01-045 Jean Bart
 * 14. OP-01 #OP01-077 Perona
 * 15. EB-01 #EB01-016 Bingoh
 * 16. EB-02 #EB02-032 Iceburg
 * 17. EB-02 #EB02-033 Klabautermann
 * 18. EB-02 #EB02-038 Magellan
 * 19. EB-02 #EB02-047 Blueno
 * 20. EB-02 #EB02-054 Sanji
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CARDSIGHT_KEY = '0b625531b00f41ff8e77afc5372201d7';
const JUSTTCG_KEY = 'tcg_40a02848a8834457be7f39ba280f3bbb'; // free tier, 1000 total

console.log('=== PROVIDER VALIDATION — 20 CARDS ===\n');
console.log('CardSight AI: key=0b625531... Free=750/mo | Used so far: 50 (search+pricing 10 Pokemon)');
console.log('JustTCG: key=tcg_40a02... Free=1000 total | Used so far: 35 (resetting tomorrow)\n');

// === 20 CARD DEFINITIONS ===
const cards = [
  // 10 Pokemon EN
  { id: 'pokemon:tcgdex:sv07-002:en', name: 'Ledyba', setId: 'sv07', num: '002', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-007:en', name: 'Carnivine', setId: 'sv07', num: '007', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-074:en', name: 'Rhyhorn', setId: 'sv07', num: '074', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-079:en', name: 'Medicham', setId: 'sv07', num: '079', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-081:en', name: 'Riolu', setId: 'sv07', num: '081', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-085:en', name: 'Pancham', setId: 'sv07', num: '085', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-143:en', name: 'Bulbasaur', setId: 'sv07', num: '143', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-148:en', name: 'Squirtle', setId: 'sv07', num: '148', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv07-170:en', name: 'Terapagos ex', setId: 'sv07', num: '170', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv07', setName: 'SV07 Stellar Crown' },
  { id: 'pokemon:tcgdex:sv08-050:en', name: 'Quaxly', setId: 'sv08', num: '050', lang: 'en', rarity: null, tcg: 'pokemon', setCode: 'sv08', setName: 'SV08 Stellar Crown' },
  // 10 One Piece EN
  { id: 'onepiece:optcg:OP01-002:en', name: 'Trafalgar Law', setId: 'OP-01', num: 'OP01-002', lang: 'en', rarity: 'L', tcg: 'onepiece', setCode: 'op01', setName: 'OP-01 Romance Dawn' },
  { id: 'onepiece:optcg:OP01-003:en', name: 'Monkey.D.Luffy', setId: 'OP-01', num: 'OP01-003', lang: 'en', rarity: 'L', tcg: 'onepiece', setCode: 'op01', setName: 'OP-01 Romance Dawn' },
  { id: 'onepiece:optcg:OP01-045:en', name: 'Jean Bart', setId: 'OP-01', num: 'OP01-045', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'op01', setName: 'OP-01 Romance Dawn' },
  { id: 'onepiece:optcg:OP01-077:en', name: 'Perona', setId: 'OP-01', num: 'OP01-077', lang: 'en', rarity: 'UC', tcg: 'onepiece', setCode: 'op01', setName: 'OP-01 Romance Dawn' },
  { id: 'onepiece:optcg:EB01-016:en', name: 'Bingoh', setId: 'EB-01', num: 'EB01-016', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb01', setName: 'EB-01 Black Maria' },
  { id: 'onepiece:optcg:EB02-032:en', name: 'Iceburg', setId: 'EB-02', num: 'EB02-032', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb02', setName: 'EB-02 Bonney' },
  { id: 'onepiece:optcg:EB02-033:en', name: 'Klabautermann', setId: 'EB-02', num: 'EB02-033', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb02', setName: 'EB-02 Bonney' },
  { id: 'onepiece:optcg:EB02-038:en', name: 'Magellan', setId: 'EB-02', num: 'EB02-038', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb02', setName: 'EB-02 Bonney' },
  { id: 'onepiece:optcg:EB02-047:en', name: 'Blueno', setId: 'EB-02', num: 'EB02-047', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb02', setName: 'EB-02 Bonney' },
  { id: 'onepiece:optcg:EB02-054:en', name: 'Sanji', setId: 'EB-02', num: 'EB02-054', lang: 'en', rarity: 'C', tcg: 'onepiece', setCode: 'eb02', setName: 'EB-02 Bonney' },
];

async function main() {
  console.log('=== FETCHING EXISTING PRICES FROM DRAGOLD ===\n');
  
  // Recupera tutti i prezzi esistenti in un batch
  const allIds = cards.map(c => c.id);
  const existingPrices = {};
  
  for (let i = 0; i < allIds.length; i += 50) {
    const chunk = allIds.slice(i, i + 50);
    const { data, error } = await sb.from('card_prices')
      .select('card_id, price_market, currency, source, captured_at')
      .in('card_id', chunk);
    if (error) {
      console.log('Price fetch error:', error.message);
      continue;
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
  
  // === CARD SIGHT AI ===
  console.log('=== CARD SIGHT AI — SEARCH + PRICING (20 cards) ===\n');
  
  const cardsightResults = {};
  let csCalls = 0;
  
  for (const card of cards) {
    console.log(`--- ${card.name} (${card.setId} #${card.num} ${card.lang}) ---`);
    
    // 1. DraGold existing
    const existing = existingPrices[card.id];
    console.log(`  DraGold: ${existing ? existing.currency + ' ' + existing.price.toFixed(2) + ' | ' + existing.source + ' | ' + new Date(existing.captured_at).toISOString().substring(0,10) : 'NO DATA'}`);
    
    // 2. CardSight search
    const searchUrl = `https://api.cardsight.ai/v1/catalog/search?q=${encodeURIComponent(card.name)}`;
    let searchResp;
    try {
      searchResp = await fetch(searchUrl, {
        headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' }
      });
      csCalls++;
    } catch (e) {
      console.log('  CardSight search ERROR:', e.message);
      cardsightResults[card.id] = { error: 'search_failed', cardsightId: null, pricing: null };
      continue;
    }
    
    if (searchResp.status !== 200) {
      console.log(`  CardSight search: HTTP ${searchResp.status}`);
      cardsightResults[card.id] = { error: 'search_http_' + searchResp.status, cardsightId: null, pricing: null };
      continue;
    }
    
    const searchData = await searchResp.json();
    if (!searchData.results || searchData.results.length === 0) {
      console.log('  CardSight search: NO RESULTS');
      cardsightResults[card.id] = { error: 'no_results', cardsightId: null, pricing: null };
      continue;
    }
    
    // Trova la carta con setName corrispondente (contiene il set name)
    const setNameSearch = card.setName.split(' ')[0]; // es: 'SV07' o 'OP-01'
    let matched = null;
    
    // Cerca corrispondenza esatta per setName
    for (const r of searchData.results) {
      if (r.type === 'card' && r.setName) {
        // Per Pokemon: CardSight usa 'Checklist' come setName per le basi
        // Per One Piece: CardSight usa i nomi dei set
        if (r.setName.toLowerCase().includes(setNameSearch.toLowerCase()) || 
            (card.tcg === 'pokemon' && r.setName === 'Checklist')) {
          matched = r;
          break;
        }
      }
    }
    
    // Se nessuna corrispondenza, prendi il primo risultato card
    if (!matched) {
      matched = searchData.results.find(r => r.type === 'card');
    }
    
    if (!matched) {
      console.log('  CardSight: no card match in results');
      cardsightResults[card.id] = { error: 'no_card_match', cardsightId: null, pricing: null };
      continue;
    }
    
    const cardsightId = matched.id;
    const cardsightName = matched.name;
    const cardsightSet = matched.setName || '';
    const cardsightNum = matched.cardNumber || '';
    
    console.log(`  CardSight search: OK — id=${cardsightId}, name="${cardsightName}", set="${cardsightSet}", num=${cardsightNum}`);
    
    // 3. CardSight pricing
    const pricingUrl = `https://api.cardsight.ai/v1/pricing/${cardsightId}`;
    let pricingResp;
    try {
      pricingResp = await fetch(pricingUrl, {
        headers: { 'X-API-Key': CARDSIGHT_KEY, 'Accept': 'application/json' }
      });
      csCalls++;
    } catch (e) {
      console.log('  CardSight pricing ERROR:', e.message);
      cardsightResults[card.id] = { cardsightId, cardsightName, cardsightSet, cardsightNum, pricing: null, error: 'pricing_failed' };
      continue;
    }
    
    if (pricingResp.status !== 200) {
      const errText = await pricingResp.text();
      console.log(`  CardSight pricing: HTTP ${pricingResp.status} — ${errText.substring(0, 200)}`);
      cardsightResults[card.id] = { cardsightId, cardsightName, cardsightSet, cardsightNum, pricing: null, error: 'pricing_http_' + pricingResp.status };
      continue;
    }
    
    const pricingData = await pricingResp.json();
    
    if (!pricingData || !pricingData.raw) {
      console.log('  CardSight pricing: no data');
      cardsightResults[card.id] = { cardsightId, cardsightName, cardsightSet, cardsightNum, pricing: null, error: 'no_pricing_data' };
      continue;
    }
    
    const records = pricingData.raw.records || [];
    const count = pricingData.raw.count || 0;
    const asOfDate = pricingData.query?.as_of_date || '';
    
    if (count === 0 || records.length === 0) {
      console.log('  CardSight pricing: 0 observations');
      cardsightResults[card.id] = { cardsightId, cardsightName, cardsightSet, cardsightNum, pricing: { count: 0, records: [], asOfDate }, error: null };
      continue;
    }
    
    // Calcola stats
    const prices = records.map(r => r.price).sort((a, b) => a - b);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const medianPrice = prices[Math.floor(prices.length / 2)];
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Conteggi per tipo
    const listingCount = records.filter(r => r.listing_type === 'fixed').length;
    const auctionCount = records.filter(r => r.listing_type === 'lot' || r.listing_type === 'auction').length;
    const ebayCount = records.filter(r => r.source === 'ebay').length;
    
    // Dati vendita completata (se disponibili)
    const soldRecords = records.filter(r => r.listing_type === 'sold' || r.status === 'sold');
    const soldCount = soldRecords.length;
    
    console.log(`  CardSight pricing: OK — ${count} obs, range $${minPrice}-$${maxPrice}, median $${medianPrice}`);
    console.log(`    listing:fixed=${listingCount}, auction=${auctionCount}, ebay=${ebayCount}, sold=${soldCount}`);
    console.log(`    as_of: ${asOfDate}`);
    
    cardsightResults[card.id] = {
      cardsightId,
      cardsightName,
      cardsightSet,
      cardsightNum,
      pricing: {
        count,
        minPrice,
        maxPrice,
        medianPrice,
        avgPrice,
        listingCount,
        auctionCount,
        ebayCount,
        soldCount,
        asOfDate,
        sample: records.slice(0, 5).map(r => ({
          price: r.price,
          date: r.date?.substring(0, 10) || '',
          source: r.source,
          listingType: r.listing_type,
          url: r.url
        }))
      }
    };
    
    console.log('');
  }
  
  console.log(`CardSight total calls: ${csCalls}\n`);
  
  // === JUSTTCG ===
  console.log('=== JUSTTCG — CARD LOOKUP (20 cards) ===\n');
  
  const justtcgResults = {};
  let jtCalls = 0;
  
  for (const card of cards) {
    console.log(`--- ${card.name} (${card.setId} #${card.num} ${card.lang}) ---`);
    
    // DraGold existing
    const existing = existingPrices[card.id];
    console.log(`  DraGold: ${existing ? existing.currency + ' ' + existing.price.toFixed(2) + ' | ' + existing.source + ' | ' + new Date(existing.captured_at).toISOString().substring(0,10) : 'NO DATA'}`);
    
    // JustTCG lookup
    // Per Pokemon: usiamo set_code='sv07' e collector_number
    // Per One Piece: JustTCG supporta One Piece? Da verificare
    
    let jtUrl;
    if (card.tcg === 'pokemon') {
      jtUrl = `https://api.justtcg.com/v1/cards?game_id=1&set_code=${card.setCode}&collector_number=${card.num}&language=en`;
    } else {
      // One Piece: JustTCG ha game_id per One Piece? Da verificare
      jtUrl = `https://api.justtcg.com/v1/cards?game_id=4&set_code=${card.setCode}&collector_number=${card.num}&language=en`;
    }
    
    let jtResp;
    try {
      jtResp = await fetch(jtUrl, {
        headers: { 'x-api-key': JUSTTCG_KEY, 'Accept': 'application/json' }
      });
      jtCalls++;
    } catch (e) {
      console.log('  JustTCG ERROR:', e.message);
      justtcgResults[card.id] = { error: 'request_failed' };
      continue;
    }
    
    console.log(`  JustTCG: HTTP ${jtResp.status}`);
    
    if (jtResp.status === 429) {
      console.log('  JustTCG: LIMIT EXCEEDED (free tier exhausted)');
      justtcgResults[card.id] = { error: 'rate_limited' };
      continue;
    }
    
    if (jtResp.status !== 200) {
      const errText = await jtResp.text();
      console.log(`  JustTCG: ${errText.substring(0, 200)}`);
      justtcgResults[card.id] = { error: 'http_' + jtResp.status };
      continue;
    }
    
    const jtData = await jtResp.json();
    
    if (!jtData || !jtData.cards || jtData.cards.length === 0) {
      console.log('  JustTCG: no cards found');
      justtcgResults[card.id] = { error: 'no_cards' };
      continue;
    }
    
    // Prendi la prima carta (dovrebbe essere l'unica con quel numero)
    const jtCard = jtData.cards[0];
    
    console.log(`  JustTCG: found card ${jtCard.name || 'N/A'}, set=${jtCard.set_name || 'N/A'}, number=${jtCard.collector_number || 'N/A'}`);
    
    // Prezzi
    const jtPrices = jtCard.pricing || {};
    const jtLow = jtPrices.low || null;
    const jtHigh = jtPrices.high || null;
    const jtMarket = jtPrices.market || jtPrices.vwap || null;
    const jtHistorical = jtPrices.historical || null;
    
    console.log(`  JustTCG pricing:`);
    console.log(`    low: ${jtLow != null ? '$' + jtLow.toFixed(2) : 'N/A'}`);
    console.log(`    high: ${jtHigh != null ? '$' + jtHigh.toFixed(2) : 'N/A'}`);
    console.log(`    market/VWAP: ${jtMarket != null ? '$' + jtMarket.toFixed(2) : 'N/A'}`);
    console.log(`    historical: ${jtHistorical != null ? '(available)' : 'N/A'}`);
    console.log(`    as_of: ${jtCard.pricing_as_of || 'N/A'}`);
    console.log(`    sales_data: ${jtCard.sales_data ? '(available)' : 'N/A'}`);
    console.log(`    variants: ${jtCard.variants ? jtCard.variants.length + ' found' : 'N/A'}`);
    
    justtcgResults[card.id] = {
      jtCardName: jtCard.name,
      jtSetName: jtCard.set_name,
      jtCollectorNumber: jtCard.collector_number,
      jtLanguage: jtCard.language,
      jtMatch: jtCard.name?.toLowerCase() === card.name.toLowerCase(),
      pricing: {
        low: jtLow,
        high: jtHigh,
        market: jtMarket,
        vwap: jtPrices.vwap,
        historical: jtHistorical,
        asOf: jtCard.pricing_as_of,
        salesData: jtCard.sales_data,
        variants: jtCard.variants
      }
    };
    
    console.log('');
  }
  
  console.log(`JustTCG total calls: ${jtCalls}\n`);
  
  // === COMPARISON TABLE ===
  console.log('=== COMPARISON TABLE ===\n');
  console.log('| # | Card | Type | Set | # | DraGold | CardSight | JustTCG |');
  console.log('|---|---|---|---|---|---|---|---|');
  
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cs = cardsightResults[card.id];
    const jt = justtcgResults[card.id];
    const existing = existingPrices[card.id];
    
    const draGoldStr = existing 
      ? `${existing.currency} ${existing.price.toFixed(2)} (${existing.source}, ${new Date(existing.captured_at).toISOString().substring(0,10)})`
      : 'NO DATA';
    
    const csStr = cs?.pricing?.medianPrice != null 
      ? `$${cs.pricing.medianPrice} (n=${cs.pricing.count}, ${cs.pricing.asOfDate})`
      : cs?.error || 'NO DATA';
    
    const jtStr = jt?.pricing?.market != null 
      ? `$${jt.pricing.market} (low=$${jt.pricing.low}, high=$${jt.pricing.high})`
      : jt?.error || 'NO DATA';
    
    console.log(`| ${i+1} | ${card.name} | ${card.tcg} | ${card.setId} | ${card.num} | ${draGoldStr} | ${csStr} | ${jtStr} |`);
  }
  
  // === SUMMARY ===
  console.log('\n=== SUMMARY ===');
  console.log('CardSight AI calls used: ' + csCalls + '/750 (free tier)');
  console.log('JustTCG calls used: ' + jtCalls + '/1000 (free tier)');
  
  const csSuccess = Object.values(cardsightResults).filter(r => r.pricing && r.pricing.count > 0).length;
  const jtSuccess = Object.values(justtcgResults).filter(r => r.pricing && r.pricing.market != null).length;
  
  console.log('CardSight cards with pricing: ' + csSuccess + '/20');
  console.log('JustTCG cards with pricing: ' + jtSuccess + '/20');
  
  // Confronto DraGold vs CardSight vs JustTCG per pokemon
  console.log('\n=== POKEMON CROSS-SOURCE COMPARISON ===');
  const pokemonCards = cards.filter(c => c.tcg === 'pokemon');
  for (const card of pokemonCards) {
    const existing = existingPrices[card.id];
    const cs = cardsightResults[card.id];
    const jt = justtcgResults[card.id];
    
    console.log(`\n${card.name} (${card.setId} #${card.num}):`);
    console.log(`  DraGold (TCGdex): ${existing ? existing.currency + ' ' + existing.price.toFixed(2) : 'NO DATA'}`);
    if (cs?.pricing) {
      console.log(`  CardSight: $${cs.pricing.medianPrice} median, range $${cs.pricing.minPrice}-$${cs.pricing.maxPrice}, ${cs.pricing.count} obs`);
    }
    if (jt?.pricing) {
      console.log(`  JustTCG: market=$${jt.pricing.market}, low=$${jt.pricing.low}, high=$${jt.pricing.high}`);
    }
  }
  
  // Confronto per One Piece
  console.log('\n=== ONE PIECE CROSS-SOURCE COMPARISON ===');
  const opCards = cards.filter(c => c.tcg === 'onepiece');
  for (const card of opCards) {
    const existing = existingPrices[card.id];
    const cs = cardsightResults[card.id];
    const jt = justtcgResults[card.id];
    
    console.log(`\n${card.name} (${card.setId} #${card.num}):`);
    console.log(`  DraGold (optcg): ${existing ? existing.currency + ' ' + existing.price.toFixed(2) + ' (' + existing.source + ')' : 'NO DATA'}`);
    if (cs?.pricing) {
      console.log(`  CardSight: $${cs.pricing.medianPrice} median, range $${cs.pricing.minPrice}-$${cs.pricing.maxPrice}, ${cs.pricing.count} obs`);
    } else {
      console.log('  CardSight: ' + (cs?.error || 'NO DATA'));
    }
    if (jt?.pricing) {
      console.log(`  JustTCG: market=$${jt.pricing.market}, low=$${jt.pricing.low}, high=$${jt.pricing.high}`);
    } else {
      console.log('  JustTCG: ' + (jt?.error || 'NO DATA'));
    }
  }
  
  // === SAVE RESULTS ===
  const { writeFile } = await import('fs/promises');
  await writeFile('provider_validation_results.json', JSON.stringify({
    cards,
    existingPrices,
    cardsightResults,
    justtcgResults,
    summary: {
      csCalls,
      jtCalls,
      csSuccess,
      jtSuccess
    }
  }, null, 2));
  
  console.log('\nResults saved to provider_validation_results.json');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
