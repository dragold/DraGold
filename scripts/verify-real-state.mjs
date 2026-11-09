// verify-real-state.mjs — verifica stato reale DraGold
// usa client Supabase JS con service key per query reali + invocazioni funzioni
// Carico .env.local manualmente — dotenv/config non funziona in questo ambiente
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function loadEnv(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File env non trovato: ${fullPath}`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    // remove quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    if (key && val !== undefined) {
      process.env[key] = val;
    }
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '../.env.local'));
loadEnv(path.join(__dirname, '..', '.env')); // fallback .env locale

console.log('Loaded env. SUPABASE_URL present:', !!process.env.SUPABASE_URL);
import { createClient } from '@supabase/supabase-js';

const PROJECT_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PROJECT_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SERVICE_KEY || !PROJECT_URL) {
  console.error('❌ MISSING CREDENTIALS');
  console.error('  SUPABASE_URL:', PROJECT_URL ? '✓' : 'MISSING');
  console.error('  SUPABASE_SERVICE_KEY:', SERVICE_KEY ? `✓ (len ${SERVICE_KEY.length})` : 'MISSING');
  console.error('  ANON_KEY:', ANON_KEY ? '✓ (len ' + ANON_KEY.length + ')' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  console.log('Supabase URL:', PROJECT_URL);
  console.log('Service key:', SERVICE_KEY.substring(0, 12) + '…');
  console.log('');

  // ── 1. DISTINCT card_id + conteggi totali ───────────────────────────────
  console.log('=== 1. COBERTURA DB — Pokemon ===');

  // Tutte le righe
  const pokemonAll = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true })
    .ilike('card_id', 'pokemon:%');

  // Righe con immagine
  const pokemonImgs = await supabase
    .from('card_prices')
    .select('image_url', { count: 'exact', head: true })
    .ilike('card_id', 'pokemon:%')
    .neq('image_url', null);

  // DISTINCT card_id — scarichiamo e contiamo lato client (50k righe ≈ OK)
  const pokemonCardsRaw = await supabase
    .from('card_prices')
    .select('card_id')
    .ilike('card_id', 'pokemon:%')
    .limit(100000);

  const pokemonUnique = new Set(pokemonCardsRaw.data.map(r => r.card_id));

  console.log(`  Righe totali (card_prices):     ${pokemonAll.count ?? 'N/A'}`);
  console.log(`  Righe con immagine non null:    ${pokemonImgs.count ?? 'N/A'}`);
  console.log(`  Carte UNICHE con prezzo (DISTINCT): ${pokemonUnique.size}`);
  console.log(`  Ratio immagini/carte uniche:    ${(pokemonImgs.count ?? 0) / Math.max(pokemonUnique.size, 1) * 100}%`);

  // Fonte prezzi — estraiamo da un sample
  const pokemonSources = await supabase
    .from('card_prices')
    .select('source')
    .ilike('card_id', 'pokemon:%')
    .limit(2000);

  const sourceCounts = {};
  pokemonSources.data?.forEach(r => {
    sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
  });
  console.log('  Fonti prezzi (sample 2000 righe):');
  Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`    ${s}: ${c}`);
  });

  console.log('');
  console.log('=== 2. COBERTURA DB — One Piece ===');

  const opAll = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true })
    .ilike('card_id', 'onepiece:%');

  const opImgs = await supabase
    .from('card_prices')
    .select('image_url', { count: 'exact', head: true })
    .ilike('card_id', 'onepiece:%')
    .neq('image_url', null);

  const opCardsRaw = await supabase
    .from('card_prices')
    .select('card_id')
    .ilike('card_id', 'onepiece:%')
    .limit(100000);

  const opUnique = new Set(opCardsRaw.data.map(r => r.card_id));

  console.log(`  Righe totali (card_prices):     ${opAll.count ?? 'N/A'}`);
  console.log(`  Righe con immagine non null:    ${opImgs.count ?? 'N/A'}`);
  console.log(`  Carte UNICHE con prezzo (DISTINCT): ${opUnique.size}`);
  console.log(`  Ratio immagini/carte uniche:    ${(opImgs.count ?? 0) / Math.max(opUnique.size, 1) * 100}%`);

  const opSources = await supabase
    .from('card_prices')
    .select('source')
    .ilike('card_id', 'onepiece:%')
    .limit(2000);

  const opSourceCounts = {};
  opSources.data?.forEach(r => {
    opSourceCounts[r.source] = (opSourceCounts[r.source] || 0) + 1;
  });
  console.log('  Fonti prezzi (sample 2000 righe):');
  Object.entries(opSourceCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => {
    console.log(`    ${s}: ${c}`);
  });

  // ── 3. Migration 20260923_ebay_item_links ──────────────────────────────
  console.log('');
  console.log('=== 3. MIGRATION 20260923_ebay_item_links ===');

  const ebayCheck = await supabase
    .from('card_ebay_items')
    .select('*', { limit: 1, count: 'exact' })
    .then(r => {
      if (r.error?.code === '42P01') return 'TABELLA NON ESISTE';
      if (r.error) return `ERRORE: ${r.error.message.substring(0, 80)}`;
      return `ESISTE (count: ${r.count ?? '?'})`;
    })
    .catch(err => `ERRORE CRITICO: ${err.message.substring(0, 80)}`);

  console.log('  Stato tabella card_ebay_items:', ebayCheck);

  // ── 4. Invocazione sync-prices-multi (batch 5 carte) ──────────────────────
  console.log('');
  console.log('=== 4. INVOCAZIONE sync-prices-multi (batch 5 carte Pokemon) ===');

  // Prendi 5 card_id distinti
  const sample = await supabase
    .from('card_prices')
    .select('card_id')
    .ilike('card_id', 'pokemon:%')
    .limit(5);

  if (!sample.data || sample.data.length === 0) {
    console.log('  ❌ Nessuna carta trovata');
  } else {
    const cardIds = sample.data.map(r => r.card_id);
    console.log('  Batch:', cardIds.join(', '));

    // Invocazione con timeout gestito via Promise.race
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT 60s')), 60000)
    );

    const start = Date.now();
    try {
      const result = await Promise.race([
        supabase.rpc('sync_prices_multi', {
          card_ids: cardIds,
          sources: ['tcgdex', 'cardmarket']
        }),
        timeout
      ]);
      const elapsed = Date.now() - start;

      if (result.error) {
        console.log(`  ❌ Errore (${elapsed}ms):`, result.error.message?.substring(0, 200) ?? result.error);
      } else {
        console.log(`  ✅ OK (${elapsed}ms). Risultato:`, JSON.stringify(result.data).substring(0, 300));
      }
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`  ❌ ${err.message === 'TIMEOUT 60s' ? 'TIMEOUT' : 'ERROR'}: ${err.message?.substring(0, 200) ?? err} (${elapsed}ms)`);
    }
  }

  // ── 5. Invocazione cache-image (1 carta) ────────────────────────────────
  console.log('');
  console.log('=== 5. INVOCAZIONE cache-image (1 carta One Piece con immagine) ===');

  const opWithImg = await supabase
    .from('card_prices')
    .select('card_id, image_url')
    .ilike('card_id', 'onepiece:%')
    .neq('image_url', null)
    .limit(5);

  if (!opWithImg.data || opWithImg.data.length === 0) {
    console.log('  ⚠️ Nessuna carta OP con immagine per il test');
  } else {
    const card = opWithImg.data[0];
    console.log('  Carta test:', card.card_id);
    console.log('  image_url:', card.image_url ? 'PRESENTE' : 'MISSING');

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT 60s')), 60000)
    );

    const start = Date.now();
    try {
      const result = await Promise.race([
        supabase.rpc('cache_image', {
          card_id: card.card_id,
          source: 'tcgdex'
        }),
        timeout
      ]);
      const elapsed = Date.now() - start;

      if (result.error) {
        console.log(`  ❌ Errore (${elapsed}ms):`, result.error.message?.substring(0, 200) ?? result.error);
      } else {
        console.log(`  ✅ OK (${elapsed}ms). Risultato:`, JSON.stringify(result.data).substring(0, 300));
      }
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`  ❌ ${err.message === 'TIMEOUT 60s' ? 'TIMEOUT' : 'ERROR'}: ${err.message?.substring(0, 200) ?? err} (${elapsed}ms)`);
    }
  }

  // ── 6. Convalida anon key (frontend) ───────────────────────────────────
  console.log('');
  console.log('=== 6. CONVALIDA ANON KEY (per frontend) ===');

  const anonClient = createClient(PROJECT_URL, ANON_KEY, {
    auth: { persistSession: false }
  });

  const health = await anonClient
    .from('card_prices')
    .select('card_id')
    .limit(1);

  if (health.error) {
    console.log('  ❌ Anon key non funziona:', health.error.message.substring(0, 150));
  } else {
    console.log('  ✅ Anon key OK — frontend può connettersi al DB.');
  }

  console.log('');
  console.log('=== VERIFICA COMPLETA ===');
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
