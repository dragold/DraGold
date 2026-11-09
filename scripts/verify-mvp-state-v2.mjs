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
  console.log('=== STATE VERIFICATION v2: 6 SET MVP ===\n');

  for (const s of SETS) {
    console.log('── ' + s.label + ' (' + s.tcg + '/' + s.set_id + ') ──');

    // 1. Conteggio REALE carte (senza limit)
    const { data: countResult, error: countErr } = await sb
      .from('cards')
      .select('count', { count: 'exact', head: true })
      .eq('tcg', s.tcg)
      .eq('set_id', s.set_id);
    if (countErr) {
      console.log('  CARDS count ERR:', countErr.message);
      continue;
    }
    const totalCards = countResult?.count ?? 0;
    console.log('  Cards totali (real count):', totalCards);

    // 2. Fetch tutti gli ID per questo set (chunked, paginato)
    const allIds = [];
    let offset = 0;
    const PAGE = 500;
    while (true) {
      const { data: page, error: pageErr } = await sb
        .from('cards')
        .select('id')
        .eq('tcg', s.tcg)
        .eq('set_id', s.set_id)
        .range(offset, offset + PAGE - 1);
      if (pageErr) {
        console.log('  ID fetch ERR:', pageErr.message);
        break;
      }
      if (!page || page.length === 0) break;
      allIds.push(...page.map(c => c.id));
      offset += PAGE;
      if (page.length < PAGE) break; // last page
    }
    const actualIds = allIds.length;
    console.log('  IDs fetched:', actualIds + ' (expected ' + totalCards + ')');

    // 3. Prezzi: per ogni card_id, fetch prices
    // Usa .in() con chunk di 200 per evitare limite Supabase
    const CHUNK = 200;
    const pricedCardIds = new Set(); // DISTINCT cards con almeno un prezzo
    const sources = new Set();
    const currencies = new Set();
    let oldest = null, newest = null;

    for (let i = 0; i < actualIds; i += CHUNK) {
      const chunk = actualIds.slice(i, i + CHUNK);
      const { data: prices, error: pricesErr } = await sb
        .from('card_prices')
        .select('card_id, price_market, currency, source, captured_at')
        .in('card_id', chunk)
        .limit(5000);

      if (pricesErr && pricesErr.code !== 'PGRST116') {
        console.log('  PRICES chunk ERR:', pricesErr.message);
        continue;
      }
      const rows = prices || [];
      for (const r of rows) {
        // DISTINCT: un card_id conteggiato una volta sola
        if (r.price_market != null && !pricedCardIds.has(r.card_id)) {
          pricedCardIds.add(r.card_id);
        }
        if (r.source) sources.add(r.source);
        if (r.currency) currencies.add(r.currency);
        if (r.captured_at) {
          const d = new Date(r.captured_at);
          if (!oldest || d < oldest) oldest = d;
          if (!newest || d > newest) newest = d;
        }
      }
    }

    const pricedCount = pricedCardIds.size;
    const coverage = totalCards > 0 ? Math.round((pricedCount / totalCards) * 100) : 0;
    console.log('  Cards with price (distinct):', pricedCount + ' / ' + totalCards + ' (' + coverage + '%)');
    console.log('  Price sources:', Array.from(sources).join(', ') || 'none');
    console.log('  Currencies:', Array.from(currencies).join(', ') || 'none');
    console.log('  Oldest captured_at:', oldest ? oldest.toISOString() : 'none');
    console.log('  Newest captured_at:', newest ? newest.toISOString() : 'none');

    // 4. Set logos
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
      console.log('  Logo card_count:', logo.card_count ?? 'null');
      console.log('  Logo status:', logo.status || 'none');
    } else {
      console.log('  SET_LOGOS: MISSING');
    }

    // 5. Immagini: sample 10 carte + cache
    const sampleIds = actualIds > 0 ? allIds.slice(0, 10) : [];
    let withImageUrl = 0, withCachedReady = 0;
    for (const id of sampleIds) {
      const { data: card, error: cardErr } = await sb
        .from('cards')
        .select('image_url')
        .eq('id', id)
        .single();
      if (card && card.image_url) withImageUrl++;

      const { data: cache, error: cacheErr } = await sb
        .from('card_image_cache')
        .select('cached_url, status')
        .eq('card_id', id)
        .eq('status', 'ready')
        .single();
      if (cache && cache.cached_url) withCachedReady++;
    }
    console.log('  Sample 10: ' + withImageUrl + '/10 image_url, ' + withCachedReady + '/10 cached ready');

    // 6. Identity verification per SV07
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

  console.log('=== END VERIFICATION v2 ===');
}

main().catch(e => console.log('FATAL:', e.message));
