// DraGold: Sync prezzi da TCGdex (gratis) per Pokemon e One Piece
// API endpoint: POST /api/sync-prices
// Body: { tcg: "pokemon" | "onepiece", limit: 100, offset: 0 }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase non configurato');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

async function fetchTcgdexPrice(sourceId, lang = 'en') {
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(sourceId)}`;
  const req = await fetch(url, {
    headers: { 'User-Agent': 'DraGold-Sync/1.0' },
    signal: AbortSignal.timeout(8000)
  });
  if (!req.ok) return null;
  const data = await req.json();
  if (!data?.pricing) return null;
  
  const cm = data.pricing.cardmarket;
  const tp = data.pricing.tcgplayer;
  
  return {
    market: cm?.avg || tp?.normal?.avg || tp?.holofoil?.avg || null,
    currency: cm?.avg ? 'EUR' : (tp?.normal?.avg ? 'USD' : null),
    source: cm?.avg ? 'tcgdex-cardmarket' : (tp?.normal?.avg ? 'tcgdex-tcgplayer' : null),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tcg, limit = 50, offset = 0 } = req.body || {};
    if (!tcg || tcg !== 'pokemon') {
      return res.status(400).json({ error: 'TCGdex supporta esclusivamente tcg="pokemon". Per One Piece usa scripts/ingest-market-tcgcsv.js' });
    }

    const sb = getSupabase();
    
    // Prendi le carte dalla tabella cards (ID composto corretto per card_prices)
    const { data: cards, error: cardsError } = await sb
      .from('cards')
      .select('id, tcg, name, lang, set_id, card_number')
      .eq('tcg', tcg)
      .order('id')
      .range(offset, offset + limit - 1);

    if (cardsError) {
      return res.status(500).json({ error: cardsError.message });
    }

    if (!cards || cards.length === 0) {
      return res.status(200).json({ synced: 0, skipped: 0, errors: 0, next_offset: offset, message: 'Nessuna carta trovata' });
    }

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const card of cards) {
      try {
        // Estrai sourceId dal card_id (terzo segmento)
        const parts = card.id.split(':');
        if (parts.length < 3) {
          skipped++;
          continue;
        }
        const sourceId = parts[2];
        const lang = card.lang || 'en';
        
        const priceData = await fetchTcgdexPrice(sourceId, lang);
        
        if (!priceData || !priceData.market || !priceData.source) {
          skipped++;
          continue;
        }

        // Verifica se prezzo esiste già
        const { data: existing } = await sb
          .from('card_prices')
          .select('id')
          .eq('card_id', card.id)
          .eq('source', priceData.source)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        // Inserisci prezzo
        const { error: insertError } = await sb.from('card_prices').insert({
          card_id: card.id,
          source: priceData.source,
          currency: priceData.currency,
          price_market: priceData.market,
          raw_response: JSON.stringify({ fetchedAt: new Date().toISOString() }),
          captured_at: new Date().toISOString(),
        });

        if (insertError) {
          if (insertError.message?.includes?.('duplicate')) {
            skipped++;
          } else {
            errors++;
          }
          continue;
        }

        synced++;
      } catch (err) {
        errors++;
      }
    }

    return res.status(200).json({
      synced,
      skipped,
      errors,
      next_offset: offset + cards.length,
      total_cards_in_batch: cards.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
