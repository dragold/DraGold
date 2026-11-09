// check-with-anon-key.mjs — verifica DB accessibile con anon key (frontend)
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
  console.log('PROJECT_URL:', PROJECT_URL);
  console.log('ANON_KEY:', ANON_KEY.substring(0, 20) + '… (len=' + ANON_KEY.length + ')');
  console.log('');

  // 1. Tabelle visibili con anon key
  console.log('=== 1. TABELLE VISIBILI (anon key) ===');
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (tablesError) {
    console.log('Errore information_schema:', tablesError.message.substring(0, 150));
    console.log('(RLS potrebbe bloccare information_schema per anon key)');
  } else {
    const names = (tables || []).map(r => r.table_name).sort();
    console.log(`  Tabelle visibili: ${names.length}`);
    names.forEach(t => console.log(`    - ${t}`));
  }

  // 2. Direct: prova a leggere card_prices
  console.log('\n=== 2. card_prices con anon key ===');
  const { count: cpCount, error: cpError } = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true });

  console.log('  Righe totali:', cpError ? cpError.message.substring(0, 100) : cpCount);

  // 3. Sample dati
  const { data: sample, error: sampleError } = await supabase
    .from('card_prices')
    .select('card_id, source, price, image_url')
    .limit(10);

  if (sampleError) {
    console.log('  Sample error:', sampleError.message.substring(0, 150));
  } else if (sample && sample.length > 0) {
    console.log('  Sample 10 righe:');
    sample.forEach((r, i) => {
      console.log(`    [${i}] ${r.card_id} | ${r.source} | ${r.price} | img=${r.image_url ? '✓' : '✗'}`);
    });
  } else {
    console.log('  Nessun dato restituito (potrebbe essere vuoto o RLS bloccante)');
  }

  // 4. Query con filter specifico
  console.log('\n=== 3. Pokemon con anon key ===');
  const { count: pCount } = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true })
    .ilike('card_id', 'pokemon:%');

  console.log('  Pokemon count:', pCount);

  const { data: pSample, error: pErr } = await supabase
    .from('card_prices')
    .select('card_id, source, price, image_url')
    .ilike('card_id', 'pokemon:%')
    .limit(3);

  if (pErr) {
    console.log('  Error:', pErr.message.substring(0, 100));
  } else if (pSample && pSample.length > 0) {
    console.log('  Sample Pokemon:');
    pSample.forEach((r, i) => {
      console.log(`    [${i}] ${r.card_id} | ${r.source} | price=${r.price} | img=${r.image_url ? '✓' : '✗'}`);
    });
  } else {
    console.log('  Nessun Pokemon trovato o RLS bloccante');
  }

  // 5. One Piece
  console.log('\n=== 4. One Piece con anon key ===');
  const { count: opCount } = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true })
    .ilike('card_id', 'onepiece:%');

  console.log('  One Piece count:', opCount);

  const { data: opSample } = await supabase
    .from('card_prices')
    .select('card_id, source, price, image_url')
    .ilike('card_id', 'onepiece:%')
    .limit(3);

  if (opSample && opSample.length > 0) {
    console.log('  Sample OP:');
    opSample.forEach((r, i) => {
      console.log(`    [${i}] ${r.card_id} | ${r.source} | price=${r.price} | img=${r.image_url ? '✓' : '✗'}`);
    });
  }

  // 6. Alerts
  console.log('\n=== 5. alerts con anon key ===');
  const { count: aCount, data: aData } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true });

  console.log('  alerts count:', aCount);

  // 7. Test funzione HTTP con anon key — le funzioni pubbliche dovrebbero essere raggiungibili
  console.log('\n=== 6. Funzioni pubbliche via HTTP (anon key) ===');
  const functionsToCheck = ['sync-prices-multi', 'cache-image', 'refresh-prices', 'sync-sets'];
  
  for (const fnName of functionsToCheck) {
    try {
      const res = await fetch(`${PROJECT_URL}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: true })
      });
      console.log(`  ${fnName}: HTTP ${res.status} ${res.statusText} — ${res.status === 200 ? 'ACCESSIBLE' : res.status === 401 ? 'UNAUTHORIZED' : 'OTHER'}`);
      if (res.status !== 200 && res.status !== 401) {
        const text = await res.text();
        console.log(`    Response: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`  ${fnName}: errore — ${err.message.substring(0, 100)}`);
    }
  }

  // 8. Test lista funzioni
  console.log('\n=== 7. Lista funzioni via HTTP (anon key) ===');
  try {
    const res = await fetch(`${PROJECT_URL}/functions/v1/`, {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });
    console.log('  Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('  Response:', text.substring(0, 500));
  } catch (err) {
    console.log('  Errore:', err.message.substring(0, 100));
  }

  console.log('\n=== FINE VERIFICA ANON KEY ===');
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
