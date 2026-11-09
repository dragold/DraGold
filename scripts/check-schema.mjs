// check-schema.mjs — schema reale card_prices + test funzioni breve
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

function loadEnv(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) return;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    if (key && val !== undefined) process.env[key] = val;
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '../.env.local'));

const PROJECT_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!PROJECT_URL || !ANON_KEY) { console.error('MISSING'); process.exit(1); }

const supabase = createClient(PROJECT_URL, ANON_KEY, {
  auth: { persistSession: false }
});

async function run() {
  // 1. Schema card_prices reale
  console.log('=== 1. SCHEMA card_prices (anon key) ===');
  
  const { data: cols, error: colsError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'card_prices')
    .eq('table_schema', 'public');

  if (colsError) {
    console.log('  Error info schema:', colsError.message.substring(0, 150));
    // Fallback: prova con un sample e vedi le colonne
    const { data: sample } = await supabase
      .from('card_prices')
      .select('*, -price')
      .limit(1);
    if (sample && sample.length > 0) {
      console.log('  Colonne dal sample:', Object.keys(sample[0]).join(', '));
    }
  } else if (cols && cols.length > 0) {
    console.log('  Colonne:');
    cols.forEach(c => console.log(`    - ${c.column_name} (${c.data_type})`));
  }

  // 2. Prime righe effettive
  console.log('\n=== 2. PRIME RIGHE card_prices ===');
  const { data: rows, error: rowsError } = await supabase
    .from('card_prices')
    .select('card_id, source, image_url, created_at')
    .limit(5);

  if (rowsError) {
    console.log('  Error:', rowsError.message.substring(0, 150));
  } else if (rows) {
    rows.forEach((r, i) => {
      console.log(`  [${i}] ${r.card_id} | source=${r.source} | img=${r.image_url ? '✓' : '✗'} | ${r.created_at}`);
    });
  }

  // 3. Verifica quale colonna ha il prezzo
  console.log('\n=== 3. RICERCA COLONNA PREZZO ===');
  const priceKeywords = ['price', 'cost', 'value', 'eur', 'usd', 'itchen', 'prices', 'price_data'];
  
  const { data: allCols } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'card_prices')
    .eq('table_schema', 'public');

  if (allCols) {
    console.log('  Colonne che potrebbero essere prezzo:');
    allCols.forEach(c => {
      if (priceKeywords.some(k => c.column_name.toLowerCase().includes(k))) {
        console.log(`    ✓ ${c.column_name} (${c.data_type})`);
      }
    });
  }

  // 4. Test funzioni con timeout 10s
  console.log('\n=== 4. FUNZIONI (anon key, timeout 10s) ===');
  const functions = ['sync-prices-multi', 'cache-image', 'refresh-prices', 'sync-sets'];
  
  for (const fnName of functions) {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    try {
      const result = await Promise.race([
        fetch(`${PROJECT_URL}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ test: true })
        }).then(r => ({ status: r.status, text: r.text() })),
        timeout
      ]);
      const body = await result.text;
      console.log(`  ${fnName}: HTTP ${result.status} — ${result.status === 200 ? 'OK' : result.status === 401 ? '401 Unauthorized' : result.status === 404 ? '404 Not Found' : 'OTHER'} — ${body.substring(0, 150)}`);
    } catch (err) {
      console.log(`  ${fnName}: ${err.message === 'timeout' ? 'TIMEOUT 10s' : err.message.substring(0, 100)}`);
    }
  }

  // 5. Verifica se card_prices ha pokemon:% e onepiece:% sono le uniche categorie
  console.log('\n=== 5. DISTRIBUZIONE CARTE PER TCG ===');
  const prefixes = await supabase
    .from('card_prices')
    .select('card_id')
    .limit(10000);

  if (prefixes.data) {
    const counts = {};
    prefixes.data.forEach(r => {
      const match = r.card_id.match(/^([^:]+):/);
      const prefix = match ? match[1] : 'unknown';
      counts[prefix] = (counts[prefix] || 0) + 1;
    });
    console.log('  Prefixes (da sample 10k):');
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
      console.log(`    ${p}: ${c}`);
    });
  }

  console.log('\n=== FINE SCEMA CHECK ===');
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
