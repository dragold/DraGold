import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
const KU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
if (!KU || !SK) { console.log('MISSING CREDS'); process.exit(1); }
const sb = createClient(KU, SK);
try {
  const { data, error } = await sb.from('card_prices')
    .select('card_id, price_market, currency, source, captured_at')
    .eq('card_id', 'pokemon:tcgdex:sv07-001:en')
    .limit(1);
  if (error) console.log('ERR:', error.message);
  else if (data && data.length) console.log('FOUND:', JSON.stringify(data[0]));
  else console.log('NOT FOUND');
} catch(e) { console.log('FATAL:', e.message); }
