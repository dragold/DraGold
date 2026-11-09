#!/usr/bin/env node
// DraGold — Popolamento diretto prezzi e immagini (senza dipendenza da deploy funzioni)
// Usa le API esterne (TCGdex, optcg-api) + service key Supabase per write diretto nel DB.
// Questo bypassa la necessità di deployare cache-image e sync-prices-multi.

const { createClient } = require('@supabase/supabase-js');

// Configurazione dal .env.local (leggibile solo da Node, non da browser)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pimwkmwrduqkaydyvxqz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_KEY === 'sb_sec...1oDe') {
  console.error('ERRORE: SUPABASE_SERVICE_KEY non configurato o placeholder');
  console.error('Carica le credenziali da .env.local o imposta le variabili d\'ambiente');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// API endpoints esterni per prezzi
const TCG_API = {
  pokemon: 'https://api.tcgdex.online/api/v2/en',
  onepiece: 'https://api.optcgapi.com',
  mtg: null, // non supportato in questa versione
  ygo: null, // non supportato in questa versione
};

// Batch size per chiamate API (TCGdex gratuito ha limiti)
const BATCH_SIZE = 20;
const MAX_CARDS_PER_TCG = 1000; // limite conservativo per evitare rate limit

// ── Utility ────────────────────────────────────────────────────────────────

async function fetchJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractPrice(data, source) {
  // Estrae il prezzo dal formato vario delle API
  // Solo prezzi affidabili: da TCGdex (market) o optcg (price)
  if (!data) return null;

  if (source === 'tcgdex') {
    // TCGdex: data.price?.market, data.prices?.[source]?.market
    if (data.price?.market) return data.price.market;
    if (data.prices) {
      for (const p of Object.values(data.prices)) {
        if (p?.market) return p.market;
      }
    }
  }

  if (source === 'optcg') {
    // optcg-api: data.price, data.prices?.[0]?.price
    if (data.price) return data.price;
    if (data.prices && data.prices.length > 0) return data.prices[0].price;
  }

  return null;
}

function extractImage(data, source) {
  // Estrae URL immagine dal formato vario
  if (!data) return null;

  if (source === 'tcgdex') {
    // TCGdex: data.image.url, data.images?.[0]?.url
    if (data.image?.url) return data.image.url;
    if (data.images?.[0]?.url) return data.images[0].url;
  }

  if (source === 'optcg') {
    // optcg-api: data.image, data.images?.[0]
    if (data.image) return data.image;
    if (data.images?.[0]) return data.images[0];
  }

  return null;
}

// ── Popolamento prezzi ──────────────────────────────────────────────────────

async function populatePricesForTcg(tcg, options = {}) {
  const { limit = MAX_CARDS_PER_TCG, batchSize = BATCH_SIZE, dryRun = false } = options;
  const apiBase = TCG_API[tcg];
  if (!apiBase) {
    console.log(`[${tcg}] API non supportata, skip`);
    return { synced: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n=== Popolamento prezzi ${tcg.toUpperCase()} ===`);

  // Ottieni le carte del TCG con 카드 ID가 있는 카드들 (le carte che hanno un ID nel DB)
  // Usiamo la vista card_prices_latest per non riscrivere prezzi gia esistenti recenti
  const { data: existing, error } = await supabase
    .from('card_prices')
    .select('card_id, captured_at')
    .order('captured_at', { ascending: false });

  if (error) {
    console.error(`[${tcg}] Errore query esistenti:`, error.message);
    return { synced: 0, skipped: 0, errors: 0 };
  }

  // Ottieni carte senza prezzi o con prezzi vecchi > 7 giorni
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: cards } = await supabase
    .from('cards')
    .select('id, source_id, tcg, lang, name, set_id, set_name, card_number, image_url')
    .eq('tcg', tcg)
    .limit(limit)
    .order('id', { ascending: true });

  if (!cards || cards.length === 0) {
    console.log(`[${tcg}] Niente carte da processare`);
    return { synced: 0, skipped: 0, errors: 0 };
  }

  console.log(`[${tcg}] ${cards.length} carte da processare`);

  let synced = 0, skipped = 0, errors = 0;

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    console.log(`[${tcg}] Batch ${Math.floor(i / batchSize) + 1}: carte ${i + 1}-${Math.min(i + batchSize, cards.length)}`);

    for (const card of batch) {
      try {
        // Costruisci URL ricerca TCGdex
        const searchQuery = card.name?.replace(/\s+/g, '-').toLowerCase() || '';
        const searchUrl = `${apiBase}/cards/search?q=${encodeURIComponent(searchQuery)}`;

        let prices = [];
        let rawResponse = null;
        let priceFound = false;

        try {
          // Prima prova: ricerca per nome
          const searchData = await fetchJSON(searchUrl);
          const cardData = Array.isArray(searchData) ? searchData.find(c => c.id === card.source_id) || searchData[0] : searchData;

          if (cardData) {
            const price = extractPrice(cardData, 'tcgdex');
            if (price) {
              prices.push({ source: 'tcgdex', currency: 'EUR', price_market: price });
              rawResponse = cardData;
              priceFound = true;
            }
          }
        } catch (e) {
          console.log(`  [${tcg}] Search per ${card.name} fallita: ${e.message}`);
        }

        // Seconda prova: ricerca per source_id se disponibile
        if (!priceFound && card.source_id) {
          try {
            const idUrl = `${apiBase}/cards/${card.source_id}`;
            const idData = await fetchJSON(idUrl);
            const price = extractPrice(idData, 'tcgdex');
            if (price) {
              prices.push({ source: 'tcgdex', currency: 'EUR', price_market: price });
              rawResponse = idData;
              priceFound = true;
            }
          } catch (e) {
            // ignorato
          }
        }

        if (!dryRun) {
          if (prices.length > 0) {
            // Inserisci i prezzi
            for (const p of prices) {
              const { error: insertError } = await supabase
                .from('card_prices')
                .insert({
                  card_id: card.id,
                  source: p.source,
                  currency: p.currency,
                  price_market: p.price_market,
                  raw_response: rawResponse,
                })
                .onConflict('card_id', 'source')
                .ignore();

              if (!insertError) {
                synced++;
              } else {
                errors++;
              }
            }
            if (synced % 10 === 0) console.log(`  [${tcg}] ${synced} prezzi sincronizzati...`);
          } else {
            skipped++;
          }
        } else {
          console.log(`  [${tcg}] ${card.name}: ${prices.length > 0 ? 'prezzo trovato' : 'nessun prezzo'}`);
        }

        // Rate limit: attendi tra le chiamate
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        errors++;
        console.log(`  [${tcg}] Errore ${card.name}: ${e.message}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  console.log(`[${tcg}] Completato: ${synced} synced, ${skipped} skipped, ${errors} errors`);
  return { synced, skipped, errors };
}

// ── Popolamento immagini ─────────────────────────────────────────────────────

async function populateImagesForTcg(tcg, options = {}) {
  const { limit = MAX_CARDS_PER_TCG, batchSize = BATCH_SIZE, dryRun = false } = options;
  const apiBase = TCG_API[tcg];
  if (!apiBase) {
    console.log(`[${tcg}] API non supportata, skip`);
    return { cached: 0, skipped: 0, errors: 0 };
  }

  console.log(`\n=== Popolamento immagini ${tcg.toUpperCase()} ===`);

  const { data: cards } = await supabase
    .from('cards')
    .select('id, source_id, tcg, lang, name, set_id, set_name, card_number, image_url, image_url_hi')
    .eq('tcg', tcg)
    .limit(limit)
    .order('id', { ascending: true });

  if (!cards || cards.length === 0) {
    console.log(`[${tcg}] Niente carte da processare`);
    return { cached: 0, skipped: 0, errors: 0 };
  }

  console.log(`[${tcg}] ${cards.length} carte da processare`);

  let cached = 0, skipped = 0, errors = 0;

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    console.log(`[${tcg}] Batch ${Math.floor(i / batchSize) + 1}: carte ${i + 1}-${Math.min(i + batchSize, cards.length)}`);

    for (const card of batch) {
      try {
        // Se l'immagine esiste gia, skip
        if (card.image_url || card.image_url_hi) {
          skipped++;
          continue;
        }

        let imageUrl = null;
        let rawImage = null;

        try {
          // Cerca la carta per ottenere l'immagine
          const searchQuery = card.name?.replace(/\s+/g, '-').toLowerCase() || '';
          const searchUrl = `${apiBase}/cards/search?q=${encodeURIComponent(searchQuery)}`;
          const searchData = await fetchJSON(searchUrl);
          const cardData = Array.isArray(searchData) ? searchData.find(c => c.id === card.source_id) || searchData[0] : searchData;

          if (cardData) {
            imageUrl = extractImage(cardData, 'tcgdex');
            rawImage = cardData;
          }
        } catch (e) {
          // Fallback: cerca per source_id
          if (card.source_id) {
            try {
              const idUrl = `${apiBase}/cards/${card.source_id}`;
              const idData = await fetchJSON(idUrl);
              imageUrl = extractImage(idData, 'tcgdex');
              rawImage = idData;
            } catch (e2) {
              // ignorato
            }
          }
        }

        if (!dryRun && imageUrl) {
          // Aggiorna il DB con l'URL immagine
          const { error: updateError } = await supabase
            .from('cards')
            .update({ image_url: imageUrl })
            .eq('id', card.id);

          if (!updateError) {
            cached++;
            // Inserisci anche nella cache immagini
            const { error: cacheError } = await supabase
              .from('card_image_cache')
              .insert({
                card_id: card.id,
                cached_url: imageUrl,
                status: 'ready',
                source: 'tcgdex',
                fetched_at: new Date().toISOString(),
              })
              .onConflict('card_id')
              .ignore();

            if (cacheError) {
              console.log(`  [${tcg}] Cache error per ${card.name}: ${cacheError.message}`);
            }
          } else {
            errors++;
          }

          if (cached % 10 === 0) console.log(`  [${tcg}] ${cached} immagini cacheate...`);
        } else if (dryRun) {
          console.log(`  [${tcg}] ${card.name}: ${imageUrl ? 'immagine trovata' : 'nessuna immagine'}`);
        }
      } catch (e) {
        errors++;
        console.log(`  [${tcg}] Errore ${card.name}: ${e.message}`);
        await new Promise(r => setTimeout(r, 500));
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`[${tcg}] Completato: ${cached} cached, ${skipped} skipped, ${errors} errors`);
  return { cached, skipped, errors };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tcg = args[0] || 'pokemon';
  const action = args[1] || 'prices';
  const dryRun = args.includes('--dry-run') || args.includes('-n');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  DraGold — Popolamento diretto prezzi/immagini                              ║
║  (senza dipendenza da deploy funzioni Supabase)                             ║
╚══════════════════════════════════════════════════════════════════════════════╝

TCG: ${tcg}
Azione: ${action}
Dry run: ${dryRun}
`);

  if (action === 'prices') {
    const result = await populatePricesForTcg(tcg, { dryRun });
    console.log(`\nRisultato: ${JSON.stringify(result, null, 2)}`);
  } else if (action === 'images') {
    const result = await populateImagesForTcg(tcg, { dryRun });
    console.log(`\nRisultato: ${JSON.stringify(result, null, 2)}`);
  } else if (action === 'all') {
    const p1 = await populatePricesForTcg(tcg, { dryRun });
    const p2 = await populateImagesForTcg(tcg, { dryRun });
    console.log(`\nRisultato prezzi: ${JSON.stringify(p1, null, 2)}`);
    console.log(`Risultato immagini: ${JSON.stringify(p2, null, 2)}`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
