import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log('=== One Piece & Migration Check ===\n');

// 1. One Piece card sample from cards table
console.log('[1] One Piece card sample:');
const { data: opSample, error: opErr } = await sb
  .from('cards')
  .select('id, name, set_id, card_number, source, source_id, lang')
  .eq('tcg', 'onepiece')
  .limit(10);
if (opErr) console.log('  ERROR:', opErr.message);
else console.log('  Sample:', JSON.stringify(opSample, null, 2));

// 2. One Piece price sample
console.log('\n[2] One Piece price sample:');
const { data: opPrices, error: opPriceErr } = await sb
  .from('card_prices')
  .select('card_id, source, price_market, currency')
  .like('card_id', 'onepiece:%')
  .limit(10);
if (opPriceErr) console.log('  ERROR:', opPriceErr.message);
else console.log('  Sample:', JSON.stringify(opPrices, null, 2));

// 3. One Piece price sources breakdown
console.log('\n[3] One Piece price sources (first 1000):');
const { data: opSrc, error: opSrcErr } = await sb
  .from('card_prices')
  .select('source')
  .like('card_id', 'onepiece:%')
  .limit(1000);
if (opSrcErr) console.log('  ERROR:', opSrcErr.message);
else {
  const counts = {};
  (opSrc || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  Sources (sample 1000):', JSON.stringify(counts));
}

// 4. Pokemon JA price sources breakdown
console.log('\n[4] Pokemon JA price sources (first 1000):');
const { data: jaSrc, error: jaSrcErr } = await sb
  .from('card_prices')
  .select('source')
  .like('card_id', 'pokemon:tcgdex:%:ja')
  .limit(1000);
if (jaSrcErr) console.log('  ERROR:', jaSrcErr.message);
else {
  const counts = {};
  (jaSrc || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  Sources (sample 1000):', JSON.stringify(counts));
}

// 5. Check if cards table has 'source' column with values like 'tcgplayer', 'tcgdex', etc.
console.log('\n[5] Pokemon EN card sources:');
const { data: pkmnSources, error: pkmnSrcErr } = await sb
  .from('cards')
  .select('source')
  .eq('tcg', 'pokemon')
  .eq('lang', 'en')
  .limit(1000);
if (pkmnSrcErr) console.log('  ERROR:', pkmnSrcErr.message);
else {
  const counts = {};
  (pkmnSources || []).forEach(r => { counts[r.source] = (counts[r.source] || 0) + 1; });
  console.log('  Sources (sample 1000):', JSON.stringify(counts));
}

// 6. Check for cards with no prices (Pokemon EN)
console.log('\n[6] Pokemon EN cards without prices (sample):');
const { data: noPrice, error: noPriceErr } = await sb.rpc('no', {})
// Try a different approach - get a card and check if it has prices
const { data: oneCard, error: oneCardErr } = await sb
  .from('cards')
  .select('id')
  .eq('tcg', 'pokemon')
  .eq('lang', 'en')
  .limit(1);
if (oneCardErr) console.log('  ERROR getting card:', oneCardErr.message);
else if (oneCard && oneCard.length > 0) {
  const cardId = oneCard[0].id;
  console.log('  Checking card:', cardId);
  const { data: prices, error: priceErr } = await sb
    .from('card_prices')
    .select('source, price_market')
    .eq('card_id', cardId);
  if (priceErr) console.log('  ERROR:', priceErr.message);
  else console.log('  Prices for this card:', JSON.stringify(prices));
}

// 7. Check _supabase_migrations under info_schema
console.log('\n[7] Migration tables in schema:');
const { data: migTables, error: migErr } = await fetch(
  url + '/rest/v1/' + encodeURIComponent('select=table_name from information_schema.tables where table_schema=\'_supabase_migrations\'') + '',
  { headers: { apikey: key, Authorization: 'Bearer ' + key } }
).then(r => r.json()).catch(e => ({ error: e.message }));
console.log('  ->', migErr || JSON.stringify(migTables));

// Alternative: try pg_net or use REST
console.log('\n[8] Trying to list tables via information_schema:');
const { data: allTables, error: tblErr } = await sb
  .from('information_schema.tables')
  .select('table_name', { count: 'exact', head: true });
if (tblErr) console.log('  -> ERROR:', tblErr.message);
else console.log('  -> Tables found via REST:', allTables);

console.log('\n=== Done ===');
