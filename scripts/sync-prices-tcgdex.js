#!/usr/bin/env node
// DraGold: Sync prezzi TCGdex - ottimizzato con batch Supabase
// Usage: node scripts/sync-prices-tcgdex.js --tcg=pokemon --limit=100 --offset=0

const TCGDEX_BASE = 'https://api.tcgdex.net/v2';

async function fetchTcgdexPrice(sourceId) {
  if (!sourceId) return null;
  const url = `${TCGDEX_BASE}/en/cards/${encodeURIComponent(sourceId)}`;
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
    market: cm?.avg || tp?.normal?.avg || null,
    currency: cm?.avg ? 'EUR' : (tp?.normal?.avg ? 'USD' : null),
    source: cm?.avg ? 'tcgdex-cardmarket' : (tp?.normal?.avg ? 'tcgdex-tcgplayer' : null),
  };
}

async function syncPrices(tcg, limit, offset, lang = 'en') {
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!sbUrl || !sbKey) {
    console.error('ERROR: Supabase non configurato.');
    process.exit(1);
  }

  // Determina il source in base al TCG
  let sourceFilter = 'tcgdex';
  if (tcg === 'onepiece') sourceFilter = 'tcgcsv';
  if (tcg === 'ygo') sourceFilter = 'ygocsv';

  async function sbFetchBatch(path) {
    const url = `${sbUrl}/rest/v1${path}`;
    const res = await fetch(url, {
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async function sbPost(data) {
    const url = `${sbUrl}/rest/v1/card_prices`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  console.log(`\n=== Sync prezzi ${tcg.toUpperCase()} da TCGdex ===`);
  console.log(`TCG: ${tcg}, Lang: ${lang}, Limit: ${limit}, Offset: ${offset}`);

  // Passo 1: carica tutte le carte in una volta
  let cards;
  try {
    cards = await sbFetchBatch(
      `/cards?select=id,name,source,source_id,card_number&tcg=eq.${tcg}&lang=eq.${lang}&source=eq.${sourceFilter}&order=id.asc&limit=${limit}&offset=${offset}`
    );
  } catch (err) {
    console.error('Errore fetch cards:', err.message);
    return;
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    console.log('Nessuna carta trovata.');
    console.log({ synced: 0, skipped: 0, errors: 0, next_offset: offset });
    return;
  }

  console.log(`Trovate ${cards.length} carte`);

  // Passo 2: carica TUTTI i prezzi esistenti in una sola query
  const cardIds = cards.map(c => encodeURIComponent(c.id)).join(',');
  let existingPricesRaw;
  try {
    existingPricesRaw = await sbFetchBatch(
      `/card_prices?select=card_id,source&card_id=in.(${cardIds})&limit=500`
    );
  } catch (e) {
    console.error('Errore fetch prezzi esistenti:', e.message);
    existingPricesRaw = [];
  }

  // Index: cardId -> Set di source già presenti
  const existingByCard = new Map();
  if (Array.isArray(existingPricesRaw)) {
    for (const ep of existingPricesRaw) {
      if (!existingByCard.has(ep.card_id)) existingByCard.set(ep.card_id, new Set());
      existingByCard.get(ep.card_id).add(ep.source);
    }
  }

  console.log(`Caricati ${existingByCard.size} carte con prezzi esistenti`);

  // Passo 3: per ogni carta, fetch TCGdex e inserisci se serve
  let synced = 0;
  let skipped = 0;
  let errors = 0;
  const toInsert = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const pct = Math.round((i / cards.length) * 100);
    process.stdout.write(`\rProgress: ${pct}% (${i}/${cards.length})... `);

    const sourceId = card.source_id;
    if (!sourceId) {
      skipped++;
      continue;
    }

    const existingSources = existingByCard.get(card.id) || new Set();

    try {
      const priceData = await fetchTcgdexPrice(sourceId);

      if (!priceData || !priceData.market || !priceData.source) {
        skipped++;
        continue;
      }

      // Se questa fonte esiste già, skip
      if (existingSources.has(priceData.source)) {
        skipped++;
        continue;
      }

      toInsert.push({
        card_id: card.id,
        source: priceData.source,
        currency: priceData.currency,
        price_market: priceData.market,
        raw_response: JSON.stringify({ fetchedAt: new Date().toISOString(), sourceId }),
        captured_at: new Date().toISOString(),
      });
    } catch (err) {
      errors++;
    }
  }

  console.log(`\nPrezzi da inserire: ${toInsert.length}, già presenti: ${skipped}, errori fetch: ${errors}`);

  if (toInsert.length === 0) {
    console.log({ synced: 0, skipped, errors, next_offset: offset + cards.length });
    return;
  }

  // Passo 4: inserisci con delay tra i batch
  for (let i = 0; i < toInsert.length; i++) {
    const item = toInsert[i];
    const pct = Math.round((i / toInsert.length) * 100);
    process.stdout.write(`\rInsert: ${pct}% (${i}/${toInsert.length})... `);
    
    try {
      await sbPost(item);
      synced++;
      if (synced % 10 === 0) {
        console.log(`\n  +${synced} inseriti`);
      }
    } catch (err) {
      errors++;
      if (err.message.includes('timeout') || err.message.includes('500')) {
        console.log(`\n  Error inserting ${item.card_id}: ${err.message}`);
      }
    }
    // Delay per evitare rate limit Supabase
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== COMPLETATO ===`);
  console.log({ synced, skipped, errors, next_offset: offset + cards.length });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { tcg: 'pokemon', limit: 50, offset: 0, lang: 'en' };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--tcg=')) opts.tcg = args[i].split('=')[1];
    else if (args[i].startsWith('--limit=')) opts.limit = parseInt(args[i].split('=')[1]);
    else if (args[i].startsWith('--offset=')) opts.offset = parseInt(args[i].split('=')[1]);
    else if (args[i].startsWith('--lang=')) opts.lang = args[i].split('=')[1];
  }
  
  if (!['pokemon', 'onepiece', 'ygo'].includes(opts.tcg)) {
    console.error('ERROR: tcg deve essere pokemon, onepiece o ygo');
    process.exit(1);
  }
  
  return opts;
}

const opts = parseArgs();
syncPrices(opts.tcg, opts.limit, opts.offset, opts.lang);
