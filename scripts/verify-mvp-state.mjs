import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const KU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
if (!KU || !SK) { console.log('MISSING CREDS'); process.exit(1); }

const sb = createClient(KU, SK, { auth: { persistSession: false } });

const SETS = [
  { tcg: 'pokemon', set_id: 'sv07', label: 'SV07' },
  { tcg: 'pokemon', set_id: 'sv08', label: 'SV08' },
  { tcg: 'onepiece', set_id: 'OP-01', label: 'OP-01' },
  { tcg: 'onepiece', set_id: 'OP-02', label: 'OP-02' },
  { tcg: 'onepiece', set_id: 'EB-01', label: 'EB-01' },
  { tcg: 'onepiece', set_id: 'EB-02', label: 'EB-02' },
];

async function main() {
  console.log('=== STATE VERIFICATION: 6 SET MVP ===\n');

  for (const s of SETS) {
    console.log('── ' + s.label + ' (' + s.tcg + '/' + s.set_id + ') ──');

    // 1. Cards totali + ID reali (chunked)
    const { data: cards, error: cardsErr } = await sb
      .from('cards')
      .select('id, tcg, set_id, card_number, lang, name, image_url')
      .eq('tcg', s.tcg)
      .eq('set_id', s.set_id)
      .limit(1000);
    if (cardsErr) {
      console.log('  CARDS ERR:', cardsErr.message);
      continue;
    }
    const totalCards = cards?.length ?? 0;
    console.log('  Cards totali:', totalCards);

    // 2. Prezzi: per ogni card_id, una query card_prices
    let pricedCount = 0;
    const sources = new Set();
    const currencies = new Set();
    let oldest = null, newest = null;

    if (totalCards > 0) {
      // Fetch prezzi in chunk per evitare limite .in()
      const CHUNK = 200;
      for (let i = 0; i < totalCards; i += CHUNK) {
        const chunk = cards.slice(i, i + CHUNK);
        const ids = chunk.map(c => c.id);
        const { data: prices, error: pricesErr } = await sb
          .from('card_prices')
          .select('card_id, price_market, currency, source, captured_at')
          .in('card_id', ids)
          .limit(10000);

        if (pricesErr && pricesErr.code !== 'PGRST116') {
          console.log('  PRICES chunk ERR:', pricesErr.message);
          continue;
        }
        const rows = prices || [];
        for (const r of rows) {
          if (r.price_market != null) pricedCount++;
          if (r.source) sources.add(r.source);
          if (r.currency) currencies.add(r.currency);
          if (r.captured_at) {
            const d = new Date(r.captured_at);
            if (!oldest || d < oldest) oldest = d;
            if (!newest || d > newest) newest = d;
          }
        }
      }
    }

    const coverage = totalCards > 0 ? Math.round((pricedCount / totalCards) * 100) : 0;
    console.log('  Cards with price:', pricedCount + ' / ' + totalCards + ' (' + coverage + '%)');
    console.log('  Price sources:', Array.from(sources).join(', ') || 'none');
    console.log('  Currencies:', Array.from(currencies).join(', ') || 'none');
    console.log('  Oldest captured_at:', oldest ? oldest.toISOString() : 'none');
    console.log('  Newest captured_at:', newest ? newest.toISOString() : 'none');

    // 3. Set logos
    const { data: logo, error: logoErr } = await sb
      .from('set_logos')
      .select('set_name, logo_url, symbol_url, release_date, source, retrieved_at, card_count, status')
      .eq('tcg', s.tcg)
      .eq('set_code', s.set_id)
      .single();
    if (logoErr && logoErr.code !== 'PGRST116') {
      console.log('  SET_LOGOS ERR:', logoErr.message);
    } else if (logo) {
      console.log('  Logo:', logo.logo_url ? 'YES' : 'NO');
      console.log('  Release date:', logo.release_date || 'none');
      console.log('  Logo source:', logo.source || 'none');
      console.log('  Logo retrieved_at:', logo.retrieved_at || 'none');
      console.log('  Logo card_count:', logo.card_count || 'null');
      console.log('  Logo status:', logo.status || 'none');
    } else {
      console.log('  SET_LOGOS: MISSING');
    }

    // 4. Immagini: sample di 10 carte
    const sample = cards?.slice(0, 10) || [];
    let withImageUrl = 0, withCached = 0;
    for (const c of sample) {
      if (c.image_url) withImageUrl++;
      // Verifica cache image per questa carta
      const { data: cache, error: cacheErr } = await sb
        .from('card_image_cache')
        .select('cached_url, status')
        .eq('card_id', c.id)
        .eq('status', 'ready')
        .single();
      if (cache && cache.cached_url) withCached++;
    }
    console.log('  Sample 10 carte: ' + withImageUrl + '/' + sample.length + ' con image_url, ' + withCached + '/' + sample.length + ' con cached ready');

    // 5. Identity verification: 5 carte SV07
    if (s.tcg === 'pokemon' && s.set_id === 'sv07') {
      console.log('  ── Identity verification (5 SV07 reali) ──');
      const preds = [
        'pokemon:tcgdex:sv07-001:en',
        'pokemon:tcgdex:sv07-048:en',
        'pokemon:tcgdex:sv07-056:en',
        'pokemon:tcgdex:sv07-158:en',
        'pokemon:tcgdex:sv07-225:en',
      ];
      for (const pred of preds) {
        const { data: cp, error: cpe } = await sb
          .from('card_prices')
          .select('card_id, price_market, currency, source, captured_at')
          .eq('card_id', pred)
          .order('captured_at', { ascending: false })
          .limit(1);
        if (cpe) {
          console.log('   ' + pred + ': ERR ' + cpe.message);
        } else if (cp && cp.length) {
          const r = cp[0];
          const match = r.card_id === pred;
          console.log('   ' + pred + ': PRICE=' + r.price_market + ' ' + r.currency + ' [' + r.source + '] | card_id=' + r.card_id + ' | MATCH=' + (match ? 'YES' : 'NO'));
        } else {
          console.log('   ' + pred + ': NO PRICE');
        }
      }
    }

    console.log('');
  }

  console.log('=== END VERIFICATION ===');
}

main().catch(e => console.log('FATAL:', e.message));
