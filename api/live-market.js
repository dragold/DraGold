// DraGold — Live Market (Fase 2). Annunci eBay ATTIVI per una carta.
//
// SEPARATO dalla valutazione: questo endpoint NON scrive market_valuations e,
// di default, NON scrive nulla. "Cosa offre il mercato ORA", non "quanto vale".
// La valutazione DraGold e' market_valuations (compute-valuations.js).
// I link di acquisto affiliati (EPN) sono src/lib/ebayLinks.js.
//
// GET /api/live-market?cardId=<cards.id>&market=IT[&limit=8][&record=1]
//   -> { card, query, listings:[...], summary:{count,lowest,median,currency} }
//
// Env (Vercel): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';
import { getEbayToken, MARKETPLACE_MAP } from './_lib/ebay.js';
import { buildBrowseQuery, parseBrowseResponse, summarizeListings } from '../scripts/lib/valuation/ebay-browse.js';

function supa() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase env mancante');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const { cardId, market = 'IT', limit = '8', record } = req.query || {};
  if (!cardId) return res.status(400).json({ error: 'cardId richiesto' });
  const mk = MARKETPLACE_MAP[market] || MARKETPLACE_MAP.IT;

  let sb;
  try { sb = supa(); } catch { return res.status(500).json({ error: 'server misconfigured' }); }

  const { data: card, error } = await sb.from('cards')
    .select('id, name, name_en, tcg, lang, set_name, card_number, canonical_card_id')
    .eq('id', cardId).maybeSingle();
  if (error || !card) return res.status(404).json({ error: 'carta non trovata' });

  const query = buildBrowseQuery({
    name: card.name_en || card.name, tcg: card.tcg, setName: card.set_name,
    number: card.card_number, lang: card.lang,
  });

  let token;
  try { token = await getEbayToken(); }
  catch (e) { return res.status(502).json({ error: 'eBay auth', detail: String(e.message).slice(0, 200) }); }

  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(Math.min(parseInt(limit, 10) || 8, 20)));
  url.searchParams.set('sort', 'price');
  let filter = `buyingOptions:{FIXED_PRICE},priceCurrency:${mk.currency}`;
  if (market !== 'US' && market !== 'CA') filter += `,itemLocationCountry:${market}`;
  url.searchParams.set('filter', filter);

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': mk.id, Accept: 'application/json' },
  });
  if (!r.ok) return res.status(r.status).json({ error: 'eBay Browse', detail: (await r.text()).slice(0, 200) });

  const { listings, count } = parseBrowseResponse(await r.json(), mk.currency);
  const summary = { ...summarizeListings(listings), total: count };

  // Opt-in: registra come osservazione kind='listing' (NON market). Spento di
  // default — Live Market != valutazione.
  if (record === '1' && listings.length) {
    try {
      const now = new Date().toISOString();
      const rows = listings.slice(0, 10).map((l) => ({
        card_id: card.id, canonical_card_id: card.canonical_card_id || null, tcg: card.tcg,
        source: 'ebay_browse', kind: 'listing', condition: l.condition,
        price: l.price, currency: l.currency, price_eur: l.currency === 'EUR' ? l.price : null,
        observed_at: now, raw: { title: l.title, url: l.url, market: mk.id },
      }));
      await sb.from('market_observations').insert(rows);
    } catch { /* best-effort */ }
  }

  return res.status(200).json({
    card: { id: card.id, name: card.name_en || card.name, set: card.set_name, number: card.card_number },
    market: mk.id, query, listings, summary,
  });
}
