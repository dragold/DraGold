import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

console.log('=== CARD SELECTION: 20 CARDS ===\n');

// Helper: fetch cards paginated, return all
async function fetchAllCards(tcg, set_id, lang) {
  const all = [];
  let off = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await sb.from('cards')
      .select('id, card_number, name, lang, rarity, print_variant, image_url, tcg, set_id')
      .eq('tcg', tcg)
      .eq('set_id', set_id)
      .eq('lang', lang)
      .range(off, off + PAGE - 1);
    if (error) { console.log('  ERR: ' + error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    off += PAGE;
    if (data.length < PAGE) break;
  }
  return all;
}

// Fetch prices for given card IDs
async function fetchPrices(cardIds) {
  const CHUNK = 200;
  const prices = {};
  for (let i = 0; i < cardIds.length; i += CHUNK) {
    const chunk = cardIds.slice(i, i + CHUNK);
    const { data, error } = await sb.from('card_prices')
      .select('card_id, price_market, currency, source, captured_at')
      .in('card_id', chunk)
      .limit(5000);
    if (error && error.code !== 'PGRST116') { console.log('  Prices ERR: ' + error.message); continue; }
    if (data) {
      for (const r of data) {
        if (r.price_market != null && !prices[r.card_id]) {
          prices[r.card_id] = { price: r.price_market, currency: r.currency, source: r.source, captured_at: r.captured_at };
        }
      }
    }
  }
  return prices;
}

// --- POKÉMON SV07: 5 cards ---
console.log('--- POKÉMON SV07 ---');
const sv07en = await fetchAllCards('pokemon', 'sv07', 'en');
console.log('  SV07 EN totali: ' + sv07en.length);

const sv07Prices = await fetchPrices(sv07en.map(c => c.id));

const sv07WithPrices = sv07en.map(c => ({
  ...c,
  price: sv07Prices[c.id]?.price ?? null,
  currency: sv07Prices[c.id]?.currency ?? null,
  source: sv07Prices[c.id]?.source ?? null,
  captured_at: sv07Prices[c.id]?.captured_at ?? null,
})).filter(c => c.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0));

console.log('  SV07 EN con prezzo: ' + sv07WithPrices.length);
console.log('  Prezzo range: ' + (sv07WithPrices[0]?.price ?? 'N/A') + ' - ' + (sv07WithPrices[sv07WithPrices.length-1]?.price ?? 'N/A'));

// Pick 10: 2 cheapest, 5 medium, 3 expensive
const sv07Cheap = sv07WithPrices.slice(0, 2);
const sv07Expensive = sv07WithPrices.slice(-3);
const sv07Medium = sv07WithPrices.slice(Math.floor(sv07WithPrices.length * 0.3), Math.floor(sv07WithPrices.length * 0.3) + 5);
const sv07Selected = [...sv07Cheap, ...sv07Medium, ...sv07Expensive];

console.log('  SELECTED (10 SV07):');
for (const c of sv07Selected) {
  console.log('    ' + c.card_number + ' | ' + c.name + ' | ' + (c.rarity || 'N/A') + ' | ' + (c.print_variant || 'normal') + ' | EUR ' + c.price + ' | ' + (c.captured_at ? new Date(c.captured_at).toISOString() : 'no ts') + ' | ' + c.id);
}

// --- POKÉMON SV08: 5 cards ---
console.log('\n--- POKÉMON SV08 ---');
const sv08en = await fetchAllCards('pokemon', 'sv08', 'en');
console.log('  SV08 EN totali: ' + sv08en.length);

const sv08Prices = await fetchPrices(sv08en.map(c => c.id));

const sv08WithPrices = sv08en.map(c => ({
  ...c,
  price: sv08Prices[c.id]?.price ?? null,
  currency: sv08Prices[c.id]?.currency ?? null,
  source: sv08Prices[c.id]?.source ?? null,
  captured_at: sv08Prices[c.id]?.captured_at ?? null,
})).filter(c => c.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0));

console.log('  SV08 EN con prezzo: ' + sv08WithPrices.length);
console.log('  Prezzo range: ' + (sv08WithPrices[0]?.price ?? 'N/A') + ' - ' + (sv08WithPrices[sv08WithPrices.length-1]?.price ?? 'N/A'));

// Pick 5: 1 cheap, 2 medium, 2 expensive
const sv08Cheap = sv08WithPrices.slice(0, 1);
const sv08Expensive = sv08WithPrices.slice(-2);
const sv08Medium = sv08WithPrices.slice(Math.floor(sv08WithPrices.length * 0.4), Math.floor(sv08WithPrices.length * 0.4) + 2);
const sv08Selected = [...sv08Cheap, ...sv08Medium, ...sv08Expensive];

console.log('  SELECTED (5 SV08):');
for (const c of sv08Selected) {
  console.log('    ' + c.card_number + ' | ' + c.name + ' | ' + (c.rarity || 'N/A') + ' | ' + (c.print_variant || 'normal') + ' | EUR ' + c.price + ' | ' + (c.captured_at ? new Date(c.captured_at).toISOString() : 'no ts') + ' | ' + c.id);
}

// --- ONE PIECE: 10 cards ---
console.log('\n--- ONE PIECE ---');

// Helper: fetch OP cards from all sets with prices
async function fetchOPCards(ids, set_id) {
  const prices = await fetchPrices(ids.map(c => c.id));
  return ids.map(c => ({
    ...c,
    price: prices[c.id]?.price ?? null,
    currency: prices[c.id]?.currency ?? null,
    source: prices[c.id]?.source ?? null,
    captured_at: prices[c.id]?.captured_at ?? null,
    set_display: set_id,
  })).filter(c => c.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0));
}

const [op01en, op02en, eb01en, eb02en] = await Promise.all([
  fetchAllCards('onepiece', 'OP-01', 'en'),
  fetchAllCards('onepiece', 'OP-02', 'en'),
  fetchAllCards('onepiece', 'EB-01', 'en'),
  fetchAllCards('onepiece', 'EB-02', 'en'),
]);

console.log('  OP-01 EN con prezzo: ' + op01en.length);
console.log('  OP-02 EN con prezzo: ' + op02en.length);
console.log('  EB-01 EN con prezzo: ' + eb01en.length);
console.log('  EB-02 EN con prezzo: ' + eb02en.length);

const op01Selected = op01en.length >= 2 ? [op01en[0], op01en[op01en.length - 1]] : op01en;
const op02Selected = op02en.length >= 2 ? [op02en[0], op02en[op02en.length - 1]] : op02en;
const eb01Selected = eb01en.length >= 3 ? [eb01en[0], eb01en[Math.floor(eb01en.length / 2)], eb01en[eb01en.length - 1]] : eb01en;
const eb02Selected = eb02en.length >= 3 ? [eb02en[0], eb02en[Math.floor(eb02en.length / 2)], eb02en[eb02en.length - 1]] : eb02en;

const opTotalSelected = [...op01Selected, ...op02Selected, ...eb01Selected, ...eb02Selected];
console.log('\n  OP ONE PIECE SELECTED (' + opTotalSelected.length + ' total):');
for (const c of opTotalSelected) {
  console.log('    ' + c.card_number + ' | ' + c.name + ' | ' + (c.rarity || 'N/A') + ' | ' + (c.print_variant || 'normal') + ' | ' + c.set_display + ' | USD ' + c.price + ' | ' + (c.captured_at ? new Date(c.captured_at).toISOString() : 'no ts') + ' | ' + c.id);
}

console.log('\n=== SUMMARY ===');
console.log('Pokémon: ' + (sv07Selected.length + sv08Selected.length) + ' (SV07: ' + sv07Selected.length + ', SV08: ' + sv08Selected.length + ')');
console.log('One Piece: ' + opTotalSelected.length);
console.log('TOTAL: ' + (sv07Selected.length + sv08Selected.length + opTotalSelected.length));

// Output as JSON for next step
const allSelected = [
  ...sv07Selected.map(c => ({ ...c, tcg: 'pokemon', set_display: 'SV07', lang: 'en' })),
  ...sv08Selected.map(c => ({ ...c, tcg: 'pokemon', set_display: 'SV08', lang: 'en' })),
  ...opTotalSelected.map(c => ({ ...c, tcg: 'onepiece', set_display: c.set_display, lang: 'en' })),
];

console.log('\n=== JSON OUTPUT ===');
console.log(JSON.stringify(allSelected, null, 2));
