import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

console.log('=== CORRECTED CARD SELECTION: 20 CARDS ===\n');

// Helper: fetch cards paginated
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

// --- POKÉMON: already selected above, has prices ---
// Re-use the 15 Pokémon from previous selection (they have prices)

const pokemonCards = [
  // SV07 (10)
  { id: 'pokemon:tcgdex:sv07-002:en', card_number: '002', name: 'Ledyba', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/002/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-007:en', card_number: '007', name: 'Carnivine', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/007/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-074:en', card_number: '074', name: 'Rhyhorn', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/074/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-077:en', card_number: '077', name: 'Meditite', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/077/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-079:en', card_number: '079', name: 'Medicham', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/079/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-081:en', card_number: '081', name: 'Riolu', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/081/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-085:en', card_number: '085', name: 'Pancham', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/085/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-170:en', card_number: '170', name: 'Terapagos ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/170/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-143:en', card_number: '143', name: 'Bulbasaur', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/143/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv07-148:en', card_number: '148', name: 'Squirtle', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv07/148/high.webp', set_display: 'SV07', lang: 'en', tcg: 'pokemon' },
  // SV08 (5)
  { id: 'pokemon:tcgdex:sv08-050:en', card_number: '050', name: 'Quaxly', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/050/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv08-188:en', card_number: '188', name: 'Technical Machine: Fluorite', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/188/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv08-190:en', card_number: '190', name: 'Tyme', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/190/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv08-239:en', card_number: '239', name: 'Latias ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/239/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon' },
  { id: 'pokemon:tcgdex:sv08-238:en', card_number: '238', name: 'Pikachu ex', rarity: null, print_variant: null, image_url: 'https://assets.tcgdex.net/en/sv/sv08/238/high.webp', set_display: 'SV08', lang: 'en', tcg: 'pokemon' },
];

console.log('--- POKÉMON (' + pokemonCards.length + ' cards) ---');
const pokemonIds = pokemonCards.map(c => c.id);
const pokemonPrices = await fetchPrices(pokemonIds);

for (const c of pokemonCards) {
  const p = pokemonPrices[c.id];
  c.price = p?.price ?? null;
  c.currency = p?.currency ?? null;
  c.source = p?.source ?? null;
  c.captured_at = p?.captured_at ?? null;
  console.log('  ' + c.card_number + ' | ' + c.name + ' | ' + c.set_display + ' | ' + (c.price ? c.currency + ' ' + c.price.toFixed(2) : 'NO PRICE') + ' | source: ' + (c.source || 'none') + ' | ' + (c.captured_at ? new Date(c.captured_at).toISOString() : 'no ts'));
}

// --- ONE PIECE: fetch prices for selected cards ---
console.log('\n--- ONE PIECE (selecting from priced subsets) ---');

// Get ALL One Piece cards with prices
const opSets = [
  { tcg: 'onepiece', set_id: 'OP-01', display: 'OP-01' },
  { tcg: 'onepiece', set_id: 'OP-02', display: 'OP-02' },
  { tcg: 'onepiece', set_id: 'EB-01', display: 'EB-01' },
  { tcg: 'onepiece', set_id: 'EB-02', display: 'EB-02' },
];

// For each set, fetch all EN cards, attach prices, sort by price
const allOPCards = [];
for (const s of opSets) {
  const cards = await fetchAllCards(s.tcg, s.set_id, 'en');
  const prices = await fetchPrices(cards.map(c => c.id));
  for (const c of cards) {
    const p = prices[c.id];
    if (p && p.price != null) {
      allOPCards.push({
        ...c,
        price: p.price,
        currency: p.currency,
        source: p.source,
        captured_at: p.captured_at,
        set_display: s.display,
      });
    }
  }
}

console.log('  One Piece EN cards WITH prices: ' + allOPCards.length);
console.log('  Prezzo range: $' + Math.min(...allOPCards.map(c => c.price)) + ' - $' + Math.max(...allOPCards.map(c => c.price)));

// Sort by price
allOPCards.sort((a, b) => a.price - b.price);

// Pick 10: 2 cheapest, 4 medium, 4 expensive (spread across sets)
const opCheap = allOPCards.slice(0, 2);
const opExpensive = allOPCards.slice(-4);
const opMedium = allOPCards.slice(Math.floor(allOPCards.length * 0.3), Math.floor(allOPCards.length * 0.3) + 4);

// Ensure we don't pick duplicates (same card appearing in both cheap and expensive)
const seen = new Set();
const opSelected = [];
for (const c of [...opCheap, ...opMedium, ...opExpensive]) {
  if (!seen.has(c.id)) {
    seen.add(c.id);
    opSelected.push(c);
  }
}

console.log('  SELECTED (' + opSelected.length + ' cards):');
for (const c of opSelected) {
  console.log('    ' + c.card_number + ' | ' + c.name + ' | ' + c.set_display + ' | ' + (c.rarity || 'N/A') + ' | ' + c.currency + ' ' + c.price.toFixed(2) + ' | source: ' + (c.source || 'none') + ' | ' + (c.captured_at ? new Date(c.captured_at).toISOString() : 'no ts') + ' | ' + c.id);
}

// Final 20 cards
const all20Cards = [
  ...pokemonCards.map(c => ({ ...c, tcg: 'pokemon' })),
  ...opSelected.map(c => ({ ...c, tcg: 'onepiece' })),
];

console.log('\n=== FINAL 20 CARDS ===');
console.log('Pokémon: ' + pokemonCards.length + ' (SV07: 10, SV08: 5)');
console.log('One Piece: ' + opSelected.length);
console.log('TOTAL: ' + all20Cards.length);

// Output JSON
console.log('\n=== JSON FOR NEXT STEP ===');
console.log(JSON.stringify(all20Cards.map(c => ({
  id: c.id,
  card_number: c.card_number,
  name: c.name,
  rarity: c.rarity,
  print_variant: c.print_variant,
  image_url: c.image_url,
  tcg: c.tcg,
  set_id: c.set_id,
  set_display: c.set_display,
  lang: c.lang,
  price: c.price,
  currency: c.currency,
  source: c.source,
  captured_at: c.captured_at,
})), null, 2));
