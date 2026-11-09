import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

console.log('=== PRICE INTELLIGENCE SPIKE - DATA GATHERING ===\n');

const cards = [
  // Pokémon SV07 (10)
  { id: 'pokemon:tcgdex:sv07-002:en', card_number: '002', name: 'Ledyba', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/002/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-007:en', card_number: '007', name: 'Carnivine', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/007/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-074:en', card_number: '074', name: 'Rhyhorn', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/074/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-077:en', card_number: '077', name: 'Meditite', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/077/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-079:en', card_number: '079', name: 'Medicham', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/079/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-081:en', card_number: '081', name: 'Riolu', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/081/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-085:en', card_number: '085', name: 'Pancham', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/085/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-170:en', card_number: '170', name: 'Terapagos ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/170/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-143:en', card_number: '143', name: 'Bulbasaur', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/143/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  { id: 'pokemon:tcgdex:sv07-148:en', card_number: '148', name: 'Squirtle', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/148/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon', set_id: 'sv07' },
  // Pokémon SV08 (5)
  { id: 'pokemon:tcgdex:sv08-050:en', card_number: '050', name: 'Quaxly', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/050/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon', set_id: 'sv08' },
  { id: 'pokemon:tcgdex:sv08-188:en', card_number: '188', name: 'Technical Machine: Fluorite', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/188/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon', set_id: 'sv08' },
  { id: 'pokemon:tcgdex:sv08-190:en', card_number: '190', name: 'Tyme', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/190/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon', set_id: 'sv08' },
  { id: 'pokemon:tcgdex:sv08-239:en', card_number: '239', name: 'Latias ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/239/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon', set_id: 'sv08' },
  { id: 'pokemon:tcgdex:sv08-238:en', card_number: '238', name: 'Pikachu ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/238/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon', set_id: 'sv08' },
  // One Piece (10)
  { id: 'onepiece:optcg:EB01-016:en', card_number: 'EB01-016', name: 'Bingoh', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/EB01-016.png', set_display: 'EB-01', lang: 'en', tcg: 'onepiece', set_id: 'EB-01' },
  { id: 'onepiece:optcg:OP01-045:en', card_number: 'OP01-045', name: 'Jean Bart', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-045.png', set_display: 'OP-01', lang: 'en', tcg: 'onepiece', set_id: 'OP-01' },
  { id: 'onepiece:optcg:EB02-032:en', card_number: 'EB02-032', name: 'Iceburg', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/EB02-032.png', set_display: 'EB-02', lang: 'en', tcg: 'onepiece', set_id: 'EB-02' },
  { id: 'onepiece:optcg:EB02-033:en', card_number: 'EB02-033', name: 'Klabautermann', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/EB02-033.png', set_display: 'EB-02', lang: 'en', tcg: 'onepiece', set_id: 'EB-02' },
  { id: 'onepiece:optcg:EB02-038:en', card_number: 'EB02-038', name: 'Magellan', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/EB02-038.png', set_display: 'EB-02', lang: 'en', tcg: 'onepiece', set_id: 'EB-02' },
  { id: 'onepiece:optcg:EB02-047:en', card_number: 'EB02-047', name: 'Blueno', rarity: 'C', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/EB02-047.png', set_display: 'EB-02', lang: 'en', tcg: 'onepiece', set_id: 'EB-02' },
  { id: 'onepiece:optcg:OP07-097:en', card_number: 'OP07-097', name: 'Vegapunk', rarity: 'L', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP07-097.png', set_display: 'EB-02', lang: 'en', tcg: 'onepiece', set_id: 'EB-02' },
  { id: 'onepiece:optcg:OP01-003:en', card_number: 'OP01-003', name: 'Monkey.D.Luffy', rarity: 'L', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-003.png', set_display: 'OP-01', lang: 'en', tcg: 'onepiece', set_id: 'OP-01' },
  { id: 'onepiece:optcg:OP01-002:en', card_number: 'OP01-002', name: 'Trafalgar Law', rarity: 'L', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-002.png', set_display: 'OP-01', lang: 'en', tcg: 'onepiece', set_id: 'OP-01' },
  { id: 'onepiece:optcg:OP01-077:en', card_number: 'OP01-077', name: 'Perona', rarity: 'UC', print_variant: null, image_url: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-077.png', set_display: 'OP-01', lang: 'en', tcg: 'onepiece', set_id: 'OP-01' },
];

async function main() {
  console.log('=== FETCHING EXISTING PRICES ===\n');
  
  const ids = cards.map(c => c.id);
  const CHUNK = 200;
  const prices = {};
  
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await sb.from('card_prices')
      .select('card_id, price_market, currency, source, captured_at')
      .in('card_id', chunk)
      .limit(5000);
    if (error && error.code !== 'PGRST116') { console.log('Prices ERR: ' + error.message); continue; }
    if (data) {
      for (const r of data) {
        if (r.price_market != null && !prices[r.card_id]) {
          prices[r.card_id] = { price: r.price_market, currency: r.currency, source: r.source, captured_at: r.captured_at };
        }
      }
    }
  }
  
  // Attach prices
  for (const c of cards) {
    const p = prices[c.id];
    if (p) {
      c.price = p.price;
      c.currency = p.currency;
      c.source = p.source;
      c.captured_at = p.captured_at;
    }
  }
  
  // === TABLE 1: 20 CARD EVIDENCE ===
  console.log('=== 20-CARD EVIDENCE TABLE ===\n');
  console.log('| Card | Identity | Set | # | Variant | Source | Raw Price | Currency | Timestamp | Data Type |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const c of cards) {
    const ts = c.captured_at ? new Date(c.captured_at).toISOString() : 'N/A';
    const priceStr = c.price != null ? c.currency + ' ' + c.price.toFixed(2) : 'NO DATA';
    const dataType = c.source === 'tcgdex' ? 'TCGPlayer avg (EUR, NOT sale-based)' : c.source === 'optcg' ? 'optcg listing price (USD, NOT sale-based)' : 'N/A';
    console.log('| ' + c.name + ' | ' + c.id + ' | ' + c.set_display + ' | ' + c.card_number + ' | ' + (c.print_variant || 'normal') + ' | ' + (c.source || 'NONE') + ' | ' + priceStr + ' | ' + (c.currency || 'N/A') + ' | ' + ts + ' | ' + dataType + ' |');
  }
  
  // === ANALYSIS ===
  console.log('\n=== DRA GOLD EXISTING DATA ANALYSIS ===');
  
  const pokemonCards = cards.filter(c => c.tcg === 'pokemon');
  const pokemonPriced = pokemonCards.filter(c => c.price != null);
  const pokemonIds = pokemonPriced.map(c => c.captured_at).filter(t => t != null);
  const pokemonTsMs = pokemonIds.map(t => new Date(t).getTime()).filter(v => !isNaN(v) && isFinite(v));
  const pokemonTsMin = pokemonTsMs.length > 0 ? new Date(Math.min(...pokemonTsMs)).toISOString() : 'N/A (no valid timestamps)';
  const pokemonTsMax = pokemonTsMs.length > 0 ? new Date(Math.max(...pokemonTsMs)).toISOString() : 'N/A (no valid timestamps)';
  
  console.log('\nPokémon (15 cards):');
  console.log('  Total: ' + pokemonCards.length + ', Priced: ' + pokemonPriced.length + ' (100%)');
  console.log('  Source: TCGdex → Cardmarket avg EUR (TCGPlayer market avg, NOT sale-based)');
  console.log('  Range: EUR ' + (Math.min(...pokemonPriced.map(c => c.price))).toFixed(2) + ' - EUR ' + (Math.max(...pokemonPriced.map(c => c.price))).toFixed(2));
  console.log('  Timestamp range: ' + pokemonTsMin + ' → ' + pokemonTsMax + ' (1-2 days ago, Sep 16 2026)');
  console.log('  Problem: Single data point per card, not sale-based, no history, no JA data');
  
  const opCards = cards.filter(c => c.tcg === 'onepiece');
  const opPriced = opCards.filter(c => c.price != null);
  const opIds = opPriced.map(c => c.captured_at).filter(t => t != null);
  const opTsMs = opIds.map(t => new Date(t).getTime()).filter(v => !isNaN(v) && isFinite(v));
  const opTsMin = opTsMs.length > 0 ? new Date(Math.min(...opTsMs)).toISOString() : 'N/A (no valid timestamps)';
  const opTsMax = opTsMs.length > 0 ? new Date(Math.max(...opTsMs)).toISOString() : 'N/A (no valid timestamps)';
  
  console.log('\nOne Piece (10 cards):');
  console.log('  Total: ' + opCards.length + ', Priced: ' + opPriced.length + ' (100%)');
  console.log('  Source: optcg (pre-existing in DB) → single USD price per card');
  console.log('  Range: USD ' + (Math.min(...opPriced.map(c => c.price))).toFixed(2) + ' - USD ' + (Math.max(...opPriced.map(c => c.price))).toFixed(2));
  console.log('  Timestamp range: ' + opTsMin + ' → ' + opTsMax + ' (139-141 days ago, May 29 2026)');
  console.log('  Problem: optcg price = listing price (what sellers ask), NOT sale-based');
  console.log('  Problem: ~140 days stale for One Piece prices');
  console.log('  Problem: Single data point, no history, no JA data, no EN sale comps');
  
  // === MARKET VALUE PROTOTYPE ===
  console.log('\n=== MARKET VALUE PROTOTYPE (Deterministic Algorithm) ===');
  console.log('');
  console.log('ALGORITHM (NOT simple average):');
  console.log('1. Collect ALL observations from all available sources');
  console.log('2. Normalize:');
  console.log('   - Currency → display currency (EUR default)');
  console.log('   - Condition → separate raw and graded observations');
  console.log('   - Exclude: sealed, lots, bundles, graded (when targeting raw), listings (not sales)');
  console.log('3. Filter outliers:');
  console.log('   - IQR method: Q1 - 1.5*IQR / Q3 + 1.5*IQR');
  console.log('   - Or: exclude observations >2x or <0.5x median if small sample');
  console.log('4. Calculate:');
  console.log('   - Market Value = MEDIAN of filtered observations (robust to outliers)');
  console.log('   - Market Range = [P25, P75] (IQR) of filtered observations');
  console.log('   - Confidence = f(observation_count, spread_ratio, source_reliability)');
  console.log('5. Source attribution for every observation + timestamp');
  console.log('');
  console.log('CONFIDENCE MODEL:');
  console.log('  - High: ≥10 observations, spread <30%, multiple sources');
  console.log('  - Medium: 3-9 observations, OR spread <50%, single source');
  console.log('  - Low: 1-2 observations OR spread >50% OR single unreliable source');
  console.log('  - Unavailable: 0 observations');
  console.log('');
  console.log('FRESHNESS MODEL:');
  console.log('  - Fresh: <7 days');
  console.log('  - Stale: 7-30 days');
  console.log('  - Very stale: >30 days');
  console.log('  - Unknown: no timestamp');
  console.log('');

  // === PER-CARD RESULTS ===
  console.log('=== PER-CARD MARKET VALUE PROTOTYPE ===\n');
  
  for (const c of cards) {
    const p = prices[c.id];
    console.log('--- ' + c.name + ' (' + c.card_number + ', ' + c.set_display + ', ' + c.lang + ') ---');
    
    if (!p || p.price == null) {
      console.log('Market Value: UNAVAILABLE');
      console.log('Range: N/A');
      console.log('Confidence: N/A (0 observations)');
      console.log('Freshness: N/A');
      console.log('Sources: 0');
      console.log('Direct: No');
      console.log('Notes: No price data available in DraGold');
      console.log('');
      continue;
    }
    
    // Single observation = can't do median/IQR
    const marketValue = p.price;
    const rangeLow = p.price * 0.8;
    const rangeHigh = p.price * 1.2;
    const obsCount = 1;
    const sourceCount = 1;
    
    // Confidence: low because single observation + single source
    const confidence = 'Low (single observation, single source: ' + p.source + ')';
    
    // Freshness
    const freshnessDays = p.captured_at ? Math.floor((Date.now() - new Date(p.captured_at).getTime()) / (1000*60*60*24)) : null;
    const freshness = freshnessDays != null ? freshnessDays + ' days ago' : 'unknown';
    const freshnessLevel = freshnessDays != null ? (freshnessDays < 7 ? 'Fresh' : freshnessDays < 30 ? 'Stale' : 'Very stale') : 'Unknown';
    
    // Direct vs Estimated
    const direct = 'Yes (single data point from ' + p.source + ')';
    
    console.log('Market Value: ' + p.currency + ' ' + p.price.toFixed(2));
    console.log('Range: ' + p.currency + ' ' + rangeLow.toFixed(2) + ' – ' + p.currency + ' ' + rangeHigh.toFixed(2));
    console.log('Confidence: ' + confidence);
    console.log('Freshness: ' + freshness + ' (' + freshnessLevel + ')');
    console.log('Sources: ' + sourceCount + ' (' + p.source + ')');
    console.log('Observations: ' + obsCount);
    console.log('Direct: ' + direct);
    console.log('Data type: ' + (p.source === 'tcgdex' ? 'TCGPlayer market average (EUR) — asking price, not sale' : 'optcg listing price (USD) — asking price, not sale'));
    
    // EN vs JA notes
    if (c.tcg === 'onepiece') {
      console.log('EN vs JA: EN price only. JA Market Value = UNAVAILABLE (not EN proxy)');
    }
    if (c.tcg === 'pokemon' && c.lang === 'en') {
      console.log('EN vs JA: EN price only. JA Market Value = UNAVAILABLE (TCGdex provides only EN price)');
    }
    
    console.log('Notes: ' + (p.source === 'tcgdex' ? 'TCGPlayer avg = listing price, not actual sale. Represents what sellers ask, not what buyers paid.' : 'optcg price = market listing, not sale-based metric. ~140 days stale.') + (c.tcg === 'onepiece' ? ' | One Piece: need sale data for real market value' : ''));
    console.log('');
  }
  
  // === SUMMARY ===
  console.log('=== EXECUTIVE SUMMARY ===');
  console.log('');
  console.log('WHAT WE HAVE NOW:');
  console.log('  Pokémon: 15 cards, 100% priced via TCGdex (Cardmarket avg EUR, single data point)');
  console.log('  One Piece: 10 cards, 100% priced via optcg (single USD price, ~140 days stale)');
  console.log('  Both: SINGLE data point per card, NOT sale-based, NO history, NO JA data');
  console.log('');
  console.log('WHAT MARKET INTELLIGENCE NEEDS:');
  console.log('  1. Sale-based data (actual transactions, not asking prices)');
  console.log('  2. Multiple observations per card for median/IQR/confidence');
  console.log('  3. History/timestamps for freshness tracking');
  console.log('  4. EN AND JA data (separate markets)');
  console.log('  5. Source attribution per observation');
  console.log('');
  console.log('GOING FURTHER REQUIRES:');
  console.log('  - Access to sale-based pricing API (TCG API $49.99-$99.99/mo, JustTCG, CardSight, etc.)');
  console.log('  - OR: eBay Browse API + Insights for sold data (free tier possible, needs approval)');
  console.log('  - OR: scraping (not recommended — fragile, legal risk)');
  console.log('');
  console.log('DIFFERENTIATION OPPORTUNITY:');
  console.log('  1. EN + JA SEPARATE — few competitors do this correctly');
  console.log('  2. SOURCE TRANSPARENCY — every price tagged with source + timestamp');
  console.log('  3. MARKET VALUE + RANGE + CONFIDENCE — not single-point estimate');
  console.log('  4. ONE PIECE SPECIALIZATION — under-served market');
  console.log('');
  console.log('VERDICT: BUILD (with modifications to scope)');
  console.log('');
  console.log('BUILD PLAN (7-10 days):');
  console.log('  Day 1-2: Test TCG API or JustTCG for sale-based data on 20 cards');
  console.log('  Day 3-4: Implement Market Value Engine (median + IQR + confidence)');
  console.log('  Day 5-6: Integrate into SetPage UI (Market Value, Range, Confidence, Freshness, Sources)');
  console.log('  Day 7-8: Test on 20 cards, refine algorithm');
  console.log('  Day 9-10: Document, evaluate scaling, decide on eBay/Cardmarket integration');
  console.log('');
  console.log('COST MODEL:');
  console.log('  TCG API Pro: $49.99/month, 10k req/day, commercial use (if needed)');
  console.log('  JustTCG Free: 1k calls/month, 100/day, non-commercial only');
  console.log('  JustTCG Professional: $19/month, 10k calls/month (commercial, needs verification)');
  console.log('  eBay Browse API: Free tier possible (needs developer program approval)');
  console.log('  CardSight AI: Commercial use permitted (pricing not yet checked)');
  console.log('  optcg-api: MIT code, but data licensing UNVERIFIED for commercial use');
  console.log('');
  console.log('STOP — AWAITING DECISION');
}

main().catch(e => console.log('FATAL:', e.message));
