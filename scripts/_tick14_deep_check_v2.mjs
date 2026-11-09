import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('=== Deep Check v2 ===\n');

// 1. cards table schema
console.log('[1] cards table columns:');
const { data: cardsCols, error: cardsColErr } = await sb.from('cards').select('*').limit(1);
if (cardsColErr) console.log('  -> ERROR:', cardsColErr.message);
else console.log('  -> Columns:', Object.keys(cardsCols[0] || {}).join(', '));

// 2. cards table counts
console.log('\n[2] cards table counts:');
for (const tcg of ['pokemon', 'onepiece', 'ygo', 'mtg']) {
  const { count, error } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', tcg);
  console.log(`  -> ${tcg}: ${error ? 'ERROR: ' + error.message : count}`);
}

// 3. Pokemon JA cards count
console.log('\n[3] Pokemon JA in cards table:');
const { count: jaCount, error: jaErr } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', 'pokemon').eq('lang', 'ja');
if (jaErr) console.log('  -> ERROR:', jaErr.message);
else console.log('  -> count:', jaCount);

// 4. Pokemon EN cards count
console.log('\n[4] Pokemon EN in cards table:');
const { count: enCount, error: enErr } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', 'pokemon').eq('lang', 'en');
if (enErr) console.log('  -> ERROR:', enErr.message);
else console.log('  -> count:', enCount);

// 5. One Piece cards count
console.log('\n[5] OnePiece in cards table:');
const { count: opCount, error: opErr } = await sb.from('cards').select('*', { count: 'exact', head: true }).eq('tcg', 'onepiece');
if (opErr) console.log('  -> ERROR:', opErr.message);
else console.log('  -> count:', opCount);

// 6. Distinct price sources — use a manual approach
console.log('\n[6] Distinct price sources with counts:');
const { data: allPrices, error: allErr } = await sb.from('card_prices').select('source').order('id').range(0, 9999);
if (allErr) console.log('  -> ERROR:', allErr.message);
else {
  const counts = {};
  (allPrices || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  -> Sources (sample 10k):', JSON.stringify(counts));
}

// 7. How many distinct card_ids have prices per TCG
console.log('\n[7] Distinct cards with prices per TCG:');
for (const tcg of ['pokemon', 'onepiece', 'ygo', 'mtg']) {
  const { count, error } = await sb
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true })
    .like('card_id', `${tcg}%`);
  if (error) console.log(`  -> ${tcg}: ERROR: ${error.message}`);
  else console.log(`  -> ${tcg}: ${count}`);
}

// 8. Check migration history — look for 20260923 in supabase migrations
console.log('\n[8] Supabase migrations list:');
const { data: migrations, error: migErr } = await sb
  .from('_supabase_migrations')
  .select('version, name')
  .order('version');
if (migErr) console.log('  -> ERROR:', migErr.message);
else {
  const migs = migrations || [];
  const has20260923 = migs.find(m => m.name?.includes('ebay_item_links') || m.name?.includes('20260923'));
  console.log('  -> Total migrations:', migs.length);
  console.log('  -> 20260923_ebay_item_links present:', !!has20260923);
  if (has20260923) console.log('  -> Found:', JSON.stringify(has20260923));
  console.log('  -> Last 5 migrations:', JSON.stringify(migs.slice(-5)));
}

// 9. Pokemon JA sample from cards table
console.log('\n[9] Pokemon JA sample cards:');
const { data: jaSample, error: jaSampleErr } = await sb
  .from('cards')
  .select('id, name, set_id, card_number, source, source_id, lang')
  .eq('tcg', 'pokemon')
  .eq('lang', 'ja')
  .limit(5);
if (jaSampleErr) console.log('  -> ERROR:', jaSampleErr.message);
else console.log('  -> Sample:', JSON.stringify(jaSample));

// 10. Pokemon JA price rows
console.log('\n[10] Pokemon JA prices in card_prices:');
const { data: jaPrices, error: jpErr, count: jpCount } = await sb
  .from('card_prices')
  .select('card_id, source, price_market, currency', { count: 'exact' })
  .like('card_id', 'pokemon:tcgdex:%:ja')
  .limit(5);
if (jpErr) console.log('  -> ERROR:', jpErr.message);
else {
  console.log('  -> Count:', jpCount);
  console.log('  -> Sample:', JSON.stringify(jaPrices));
}

// 11. Check pokemon-en-ja-sync.json file
console.log('\n[11] pokemon-en-ja-sync.json state:');
const fs = await import('fs');
const syncPath = 'pokemon-en-ja-sync.json';
if (fs.existsSync(syncPath)) {
  const raw = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
  console.log('  -> Mode:', raw.mode);
  console.log('  -> Counts:', JSON.stringify(raw.counts));
  console.log('  -> Generated at:', raw.generated_at);
} else {
  console.log('  -> File not found');
}

console.log('\n=== Done ===');
