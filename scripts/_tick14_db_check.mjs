import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing env vars. SUPABASE_URL:', url, 'has key:', !!key);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function runQuery(label, queryFn) {
  try {
    const { data, error, count } = await queryFn();
    if (error) {
      console.log(`[${label}] ERROR: ${error.message}`);
      return;
    }
    console.log(`[${label}] ${count !== undefined ? 'COUNT: ' + count : 'DATA: ' + JSON.stringify(data)}`);
  } catch (e) {
    console.log(`[${label}] EXCEPTION: ${e.message}`);
  }
}

console.log('=== DraGold DB Check ===');
console.log('URL:', url);
console.log('');

// 1. Check if card_ebay_items table exists (migration 20260923)
await runQuery('card_ebay_items table', () =>
  sb.from('card_ebay_items').select('*', { count: 'exact', head: true })
);

// 2. Check if get_ebay_link_for_card function exists
await runQuery('get_ebay_link_for_card fn', () =>
  sb.rpc('get_ebay_link_for_card', { p_card_id: 'pokemon:tcgdex:base1-1:en' })
);

// 3. Price coverage — distinct card IDs with prices per TCG
await runQuery('Pokemon cards with prices (distinct)', () =>
  sb.from('card_prices').select('card_id', { count: 'exact', head: true })
    .like('card_id', 'pokemon:%')
);

await runQuery('OnePiece cards with prices (distinct)', () =>
  sb.from('card_prices').select('card_id', { count: 'exact', head: true })
    .like('card_id', 'onepiece:%')
);

// 4. Total card_prices rows
await runQuery('Total card_prices rows', () =>
  sb.from('card_prices').select('*', { count: 'exact', head: true })
);

// 5. Distinct card IDs in canonical_cards per TCG
await runQuery('canonical_cards Pokemon (total)', () =>
  sb.from('canonical_cards').select('id', { count: 'exact', head: true }).eq('tcg', 'pokemon')
);

await runQuery('canonical_cards OnePiece (total)', () =>
  sb.from('canonical_cards').select('id', { count: 'exact', head: true }).eq('tcg', 'onepiece')
);

// 6. Pokemon cards with lang='ja'
await runQuery('Pokemon JA cards in canonical_cards', () =>
  sb.from('canonical_cards').select('id', { count: 'exact', head: true }).eq('tcg', 'pokemon').eq('lang', 'ja')
);

// 7. Pokemon JA cards with prices
await runQuery('Pokemon JA cards with prices (distinct)', () =>
  sb.rpc('sql', { query: "SELECT COUNT(DISTINCT card_id) FROM card_prices WHERE card_id LIKE 'pokemon:tcgdex:%:ja'" })
);

// 8. Price sources breakdown
await runQuery('Price sources breakdown', () =>
  sb.from('card_prices').select('source', { count: 'exact', head: true })
);

// 9. Check card_prices schema
console.log('\n=== Checking card_prices columns ===');
const { data: cols, error: colErr } = await sb.rpc('sql', {
  query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'card_prices' ORDER BY ordinal_position"
});
if (colErr) {
  console.log('[card_prices schema] ERROR:', colErr.message);
} else {
  console.log('[card_prices schema]', JSON.stringify(cols));
}

// 10. Check if there's a `lang` column on canonical_cards or cards
console.log('\n=== Checking canonical_cards columns ===');
const { data: ccCols, error: ccErr } = await sb.rpc('sql', {
  query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'canonical_cards' ORDER BY ordinal_position"
});
if (ccErr) {
  console.log('[canonical_cards schema] ERROR:', ccErr.message);
} else {
  console.log('[canonical_cards schema]', JSON.stringify(ccCols));
}

console.log('\n=== Done ===');
