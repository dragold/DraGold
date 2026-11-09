#!/usr/bin/env node
// Fase 1: Scarica prezzi da TCGdex per le carte Pokemon e salva in locale
// Usa l'API pubblica TCGdex (gratuita, no auth necessaria)

const fs = require('fs');
const path = require('path');

// Configurazione
const TCG_API = {
  pokemon: 'https://api.tcgdex.net/v2/en',
  onepiece: 'https://api.optcgapi.com',
};

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'prices');
const BATCH_SIZE = 20;
const MAX_CARDS = 200; // limite conservativo
const CONCURRENCY = 3; // chiamate parallele massime

// Assicurati che la directory esista
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── Utility ────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      if (resp.status === 429) throw new Error('Rate limited');
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractPrice(data) {
  if (!data) return null;
  
  // TCGdex format
  if (data.price?.market) return data.price.market;
  
  // TCGdex: prices object con valute
  if (data.prices) {
    for (const p of Object.values(data.prices)) {
      if (p?.market) return p.market;
    }
  }
  
  // optcg format
  if (data.price) return data.price;
  if (data.prices && data.prices.length > 0) return data.prices[0].price;
  
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function downloadPrices(tcg, dryRun = false) {
  const apiBase = TCG_API[tcg];
  if (!apiBase) {
    console.log(`[${tcg}] API non supportata`);
    return [];
  }
  
  console.log(`\n=== Download prezzi ${tcg.toUpperCase()} da TCGdex ===`);
  
  const cardsFile = path.join(__dirname, '..', 'data', 'cards-pokemon.json');
  // Per altri TCG, usa OUTPUT_DIR con il nome del TCG
  
  // Carica la lista delle carte (se esiste)
  let cards = [];
  if (fs.existsSync(cardsFile)) {
    try {
      cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
      console.log(`[${tcg}] Caricato ${cards.length} carte da file locale`);
    } catch (e) {
      console.log(`[${tcg}] Errore lettura file: ${e.message}`);
    }
  }
  
  if (cards.length === 0) {
    console.log(`[${tcg}] Niente carte da processare (file non trovato o vuoto)`);
    return [];
  }
  
  // Limita a MAX_CARDS
  if (cards.length > MAX_CARDS) {
    cards = cards.slice(0, MAX_CARDS);
    console.log(`[${tcg}] Limittato a ${MAX_CARDS} carte`);
  }
  
  const results = [];
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  
  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(cards.length / BATCH_SIZE)}: carte ${i + 1}-${Math.min(i + BATCH_SIZE, cards.length)}`);
    
    const batchPromises = batch.map(async (card) => {
      try {
        // Costruisci URL ricerca
        const searchQuery = card.name?.replace(/\s+/g, '-').toLowerCase().trim() || '';
        if (!searchQuery) {
          skipped++;
          return null;
        }
        
        const searchUrl = `${apiBase}/cards/search?q=${encodeURIComponent(searchQuery)}`;
        
        try {
          const searchData = await fetchWithTimeout(searchUrl, 8000);
          let cardData = null;
          
          if (Array.isArray(searchData)) {
            // Cerca la carta con source_id corrispondente
            cardData = searchData.find(c => c.id === card.source_id) || searchData[0];
          } else if (searchData && searchData.card) {
            cardData = searchData.card;
          } else {
            cardData = searchData;
          }
          
          if (cardData) {
            const price = extractPrice(cardData);
            if (price !== null) {
              results.push({
                card_id: card.id,
                source: 'tcgdex',
                currency: 'EUR',
                price_market: price,
                raw_response: {
                  name: cardData.name || card.name,
                  source_id: cardData.id || card.source_id,
                  price: price,
                  fetched_at: new Date().toISOString(),
                },
              });
              processed++;
              return { card_id: card.id, price, status: 'found' };
            }
          }
        } catch (e) {
          // Fallback: cerca per source_id
          if (card.source_id) {
            try {
              const idUrl = `${apiBase}/cards/${card.source_id}`;
              const idData = await fetchWithTimeout(idUrl, 8000);
              const price = extractPrice(idData);
              if (price !== null) {
                results.push({
                  card_id: card.id,
                  source: 'tcgdex',
                  currency: 'EUR',
                  price_market: price,
                  raw_response: {
                    name: idData.name || card.name,
                    source_id: idData.id || card.source_id,
                    price: price,
                    fetched_at: new Date().toISOString(),
                  },
                });
                processed++;
                return { card_id: card.id, price, status: 'found_fallback' };
              }
            } catch (e2) {
              // ignorato
            }
          }
        }
        
        skipped++;
        return null;
      } catch (e) {
        errors++;
        console.log(`  Errore ${card.name}: ${e.message}`);
        return null;
      }
    });
    
    // Esegui batch con concurrency limit
    const batchResults = [];
    for (let j = 0; j < batchPromises.length; j += CONCURRENCY) {
      const chunk = batchPromises.slice(j, j + CONCURRENCY);
      const chunkResults = await Promise.all(chunk);
      batchResults.push(...chunkResults);
      // Pausa tra chunk per evitare rate limit
      if (j + CONCURRENCY < batchPromises.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    console.log(`  → ${batchResults.filter(r => r).length} prezzi trovati, ${batchResults.filter(r => !r).length} skip`);
    
    // Salva progresso ogni batch
    const outputFile = path.join(OUTPUT_DIR, `prices-${tcg}-progress.json`);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    // Pausa tra i batch
    if (i + BATCH_SIZE < cards.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // Salva risultati finali
  const finalFile = path.join(OUTPUT_DIR, `prices-${tcg}-final.json`);
  fs.writeFileSync(finalFile, JSON.stringify(results, null, 2));
  
  console.log(`\n=== ${tcg.toUpperCase()} COMPLETATO ===`);
  console.log(`  Prezzi trovati: ${processed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errori: ${errors}`);
  console.log(`  Risultati salvati in: ${finalFile}`);
  
  return results;
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const tcg = args[0] || 'pokemon';
const dryRun = args.includes('--dry-run') || args.includes('-n');

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  DraGold — Download prezzi da TCGdex (fase 1)                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

TCG: ${tcg}
Dry run: ${dryRun}
`);

downloadPrices(tcg, dryRun).then(results => {
  console.log(`\nRisultato finale: ${results.length} prezzi scaricati`);
  process.exit(0);
}).catch(e => {
  console.error('Errore fatale:', e);
  process.exit(1);
});
