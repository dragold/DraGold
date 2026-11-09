import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('=== DISTINCT Price Coverage & Final Checks ===\n');

// Use a raw HTTP request to get proper DISTINCT count via REST API
// PostgREST doesn't support COUNT(DISTINCT) directly, but we can use rpc with a custom RPC
// Or we can use the in-filter approach

// Method 1: Count distinct by using group by
async function countDistinct(tcg) {
  // We'll fetch in batches and count distinct client-side
  const cardIds = new Set();
  let from = 0;
  const batchSize = 1000;
  let totalRows = 0;
  
  while (true) {
    const { data, error } = await sb
      .from('card_prices')
      .select('card_id')
      .like('card_id', tcg + ':%')
      .range(from, from + batchSize - 1);
    
    if (error) {
      console.log(`  ERROR: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) break;
    
    data.forEach(r => cardIds.add(r.card_id));
    totalRows += data.length;
    from += batchSize;
    
    if (data.length < batchSize) break;
    if (from > 50000) {
      console.log(`  (stopped at ${from} rows for safety)`);
      break;
    }
  }
  
  return { distinct: cardIds.size, totalRows, coveragePercent: null };
}

console.log('[1] Pokemon price coverage (distinct card_ids):');
const pkmnResult = await countDistinct('pokemon');
if (pkmnResult) {
  // Pokemon cards in `cards` table: 163207 total, 14177 JA, 44706 EN
  const coverage = ((pkmnResult.distinct / 163207) * 100).toFixed(1);
  console.log(`  Distinct Pokemon cards with prices: ${pkmnResult.distinct}`);
  console.log(`  Total price rows: ${pkmnResult.totalRows}`);
  console.log(`  Pokemon cards in DB: 163,207`);
  console.log(`  Coverage: ${coverage}%`);
}

console.log('\n[2] One Piece price coverage (distinct card_ids):');
const opResult = await countDistinct('onepiece');
if (opResult) {
  const coverage = ((opResult.distinct / 6134) * 100).toFixed(1);
  console.log(`  Distinct OnePiece cards with prices: ${opResult.distinct}`);
  console.log(`  Total price rows: ${opResult.totalRows}`);
  console.log(`  OnePiece cards in DB: 6,134`);
  console.log(`  Coverage: ${coverage}%`);
}

// 3. Pokemon JA specifically
console.log('\n[3] Pokemon JA price coverage:');
const jaSet = new Set();
let jaFrom = 0;
let jaTotal = 0;
while (true) {
  const { data, error } = await sb
    .from('card_prices')
    .select('card_id')
    .like('card_id', 'pokemon:tcgdex:%:ja')
    .range(jaFrom, jaFrom + 999);
  if (error) { console.log('  ERROR:', error.message); break; }
  if (!data || data.length === 0) break;
  data.forEach(r => jaSet.add(r.card_id));
  jaTotal += data.length;
  jaFrom += 1000;
  if (jaFrom > 20000) break;
}
console.log(`  Distinct Pokemon JA cards with prices: ${jaSet.size}`);
console.log(`  Total price rows: ${jaTotal}`);
console.log(`  Pokemon JA cards in DB: 14,177`);
console.log(`  Coverage: ${((jaSet.size / 14177) * 100).toFixed(1)}%`);

// 4. Pokemon EN specifically
console.log('\n[4] Pokemon EN price coverage:');
const enSet = new Set();
let enFrom = 0;
let enTotal = 0;
while (true) {
  const { data, error } = await sb
    .from('card_prices')
    .select('card_id')
    .like('card_id', 'pokemon:tcgdex:%:en')
    .range(enFrom, enFrom + 999);
  if (error) { console.log('  ERROR:', error.message); break; }
  if (!data || data.length === 0) break;
  data.forEach(r => enSet.add(r.card_id));
  enTotal += data.length;
  enFrom += 1000;
  if (enFrom > 100000) break;
}
console.log(`  Distinct Pokemon EN cards with prices: ${enSet.size}`);
console.log(`  Total price rows: ${enTotal}`);
console.log(`  Pokemon EN cards in DB: 44,706`);

// 5. Distinct price sources overall
console.log('\n[5] Distinct price sources overall (batch 1):');
const { data: sources, error: srcErr } = await sb
  .from('card_prices')
  .select('source')
  .order('id')
  .range(0, 4999);
if (srcErr) console.log('  ERROR:', srcErr.message);
else {
  const counts = {};
  (sources || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  Sample sources:', JSON.stringify(counts));
}

// 6. Check if cards with source 'ptcg' have prices
console.log('\n[6] Pokemon PTCG source cards:');
const { count: ptcgCount, error: ptcgErr } = await sb
  .from('cards')
  .select('*', { count: 'exact', head: true })
  .eq('tcg', 'pokemon')
  .eq('source', 'ptcg');
if (ptcgErr) console.log('  ERROR:', ptcgErr.message);
else console.log(`  Count: ${ptcgCount}`);

console.log('\n=== Done ===');
