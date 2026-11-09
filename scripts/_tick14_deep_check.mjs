import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('=== Deep DB Check ===\n');

// 1. Try to fetch from card_ebay_items (if table doesn't exist, we'll get an error)
console.log('[1] card_ebay_items table check:');
const { data: ebayData, error: ebayErr } = await sb.from('card_ebay_items').select('*').limit(3);
if (ebayErr) {
  console.log('  -> ERROR:', ebayErr.message);
  console.log('  -> HINT: Table likely NOT present in deployed Supabase');
} else {
  console.log('  -> Table EXISTS, rows returned:', ebayData?.length);
}

// 2. Check cards table vs canonical_cards - are they different?
console.log('\n[2] cards table check:');
const { data: cardsData, error: cardsErr } = await sb.from('cards').select('id', { count: 'exact', head: true }).eq('tcg', 'pokemon').eq('lang', 'ja');
if (cardsErr) console.log('  -> ERROR:', cardsErr.message);
else console.log('  -> OK, Pokemon JA in cards table:', cardsData);

// 3. canonical_cards with lang='ja' — check if column exists
console.log('\n[3] canonical_cards lang=ja:');
const { count: jaCount, error: jaErr } = await sb.from('canonical_cards')
  .select('id', { count: 'exact', head: true })
  .eq('tcg', 'pokemon')
  .eq('lang', 'ja');
if (jaErr) console.log('  -> ERROR:', jaErr.message);
else console.log('  -> COUNT:', jaCount);

// 4. Check canonical_cards columns
console.log('\n[4] canonical_cards columns:');
const { data: ccCols } = await sb
  .from('canonical_cards')
  .select('*')
  .limit(1);
if (ccCols && ccCols.length > 0) {
  console.log('  -> Columns:', Object.keys(ccCols[0]).join(', '));
} else {
  console.log('  -> No data returned');
}

// 5. Check card_prices columns
console.log('\n[5] card_prices columns:');
const { data: cpCols } = await sb
  .from('card_prices')
  .select('*')
  .limit(1);
if (cpCols && cpCols.length > 0) {
  console.log('  -> Columns:', Object.keys(cpCols[0]).join(', '));
  console.log('  -> Sample row:', JSON.stringify(cpCols[0]));
} else {
  console.log('  -> No data returned, trying with select id');
  const { error: err2 } = await sb.from('card_prices').select('id').limit(1);
  if (err2) console.log('  -> ERROR:', err2.message);
}

// 6. Distinct price sources with counts (using groupBy)
console.log('\n[6] Price source breakdown:');
const { data: sources, error: srcErr } = await sb
  .from('card_prices')
  .select('source', { count: 'exact' })
  .order('source', { ascending: true });
if (srcErr) {
  console.log('  -> ERROR:', srcErr.message);
} else {
  // Group manually
  const counts = {};
  (sources || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  -> Sources:', JSON.stringify(counts));
}

// 7. Pokemon EN vs JA card count from canonical_cards
console.log('\n[7] Pokemon cards by language (canonical_cards):');
const { data: enCards, error: enErr } = await sb
  .from('canonical_cards')
  .select('id', { count: 'exact', head: true })
  .eq('tcg', 'pokemon')
  .eq('lang', 'en');
if (enErr) console.log('  -> EN ERROR:', enErr.message);
else console.log('  -> EN count:', enCards);

// 8. Check pokemon-en-ja-sync.json for state
console.log('\n[8] Pokemon JA sync state:');
const { data: jaPrices, error: jaPriceErr } = await sb
  .from('card_prices')
  .select('card_id', { count: 'exact', head: true })
  .like('card_id', 'pokemon:tcgdex:%:ja');
if (jaPriceErr) console.log('  -> ERROR:', jaPriceErr.message);
else console.log('  -> Pokemon JA price rows:', jaPrices);

// 9. Sample of Pokemon JA card_ids in canonical_cards
console.log('\n[9] Sample Pokemon JA card_ids from canonical_cards:');
const { data: jaSample, error: jaSampleErr } = await sb
  .from('canonical_cards')
  .select('id, name, set_id, card_number')
  .eq('tcg', 'pokemon')
  .eq('lang', 'ja')
  .limit(5);
if (jaSampleErr) console.log('  -> ERROR:', jaSampleErr.message);
else console.log('  -> Sample:', JSON.stringify(jaSample));

// 10. Sample of Pokemon EN card_ids from canonical_cards
console.log('\n[10] Sample Pokemon EN card_ids from canonical_cards:');
const { data: enSample, error: enSampleErr } = await sb
  .from('canonical_cards')
  .select('id, name, set_id, card_number')
  .eq('tcg', 'pokemon')
  .eq('lang', 'en')
  .limit(5);
if (enSampleErr) console.log('  -> ERROR:', enSampleErr.message);
else console.log('  -> Sample:', JSON.stringify(enSample));

// 11. One Piece sample
console.log('\n[11] Sample One Piece card_ids from canonical_cards:');
const { data: opSample, error: opSampleErr } = await sb
  .from('canonical_cards')
  .select('id, name, set_id, card_number')
  .eq('tcg', 'onepiece')
  .limit(5);
if (opSampleErr) console.log('  -> ERROR:', opSampleErr.message);
else console.log('  -> Sample:', JSON.stringify(opSample));

// 12. Check if migration 20260923 is in supabase migrations list
console.log('\n[12] Checking deployed migrations...');

console.log('\n=== Done ===');
