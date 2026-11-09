require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

(async () => {
  console.log('Fetching Pokemon card_ids...');
  let pokemonSet = new Set();
  let pokemonTotal = 0;
  let offset = 0;
  const batchSize = 5000;
  
  while (true) {
    const { data, error } = await supabase
      .from('card_prices')
      .select('card_id')
      .ilike('card_id', 'pokemon:%')
      .gt('price_market', 0)
      .range(offset, offset + batchSize - 1);
    
    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    
    data.forEach(r => pokemonSet.add(r.card_id));
    pokemonTotal += data.length;
    offset += batchSize;
    
    console.log(`  Batch: ${data.length} rows | total fetched: ${pokemonTotal} | unique: ${pokemonSet.size}`);
  }
  
  console.log('🔢 Pokemon DISTINCT cards WITH price > 0:', pokemonSet.size, '(fetched', pokemonTotal, 'rows)');
  
  console.log('Fetching One Piece card_ids...');
  let opSet = new Set();
  let opTotal = 0;
  offset = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('card_prices')
      .select('card_id')
      .ilike('card_id', 'onepiece:%')
      .gt('price_market', 0)
      .range(offset, offset + batchSize - 1);
    
    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    
    data.forEach(r => opSet.add(r.card_id));
    opTotal += data.length;
    offset += batchSize;
    
    console.log(`  Batch: ${data.length} rows | total fetched: ${opTotal} | unique: ${opSet.size}`);
  }
  
  console.log('🔢 One Piece DISTINCT cards WITH price > 0:', opSet.size, '(fetched', opTotal, 'rows)');
})().catch(e => console.error('FATAL:', e.message));
