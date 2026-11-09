// db-inventory.mjs — inventario completo del DB reale
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
loadEnv(path.join(__dirname, '..', '.env'));

const PROJECT_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!PROJECT_URL || !SERVICE_KEY) { console.error('MISSING'); process.exit(1); }

async function run() {
  const supabase = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // 1. Verifica che il service key sia service_role
  console.log('=== SERVICE KEY TYPE ===');
  const me = await supabase.auth.getUser();
  console.log('Auth user:', JSON.stringify(me.data, null, 2).substring(0, 300));

  // 2. Liste tutte le tabelle
  console.log('\n=== TABELLE ESISTENTI ===');
  
  // Via information_schema
  const tablesResult = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .neq('table_name', 'migrations');

  const tableNames = tablesResult.data
    ? tablesResult.data.map(r => r.table_name).sort()
    : [];

  console.log(`  Tabelle pubbliche (${tableNames.length}):`);
  tableNames.forEach(t => console.log(`    - ${t}`));

  // 3. Per ogni tabella, conta le righe
  console.log('\n=== CONTEGGIO RIGHE PER TABELLA ===');
  for (const table of tableNames) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`  ${table}: ERRORE — ${error.message.substring(0, 100)}`);
    } else {
      console.log(`  ${table}: ${count ?? '?'} righe`);
    }
  }

  // 4. Liste funzioni
  console.log('\n=== FUNZIONI SUPABASE (via API) ===');
  // Usiamo l'API REST delle functions: https://<project>.supabase.co/functions/v1/
  // Need to call the functions list endpoint
  try {
    const response = await fetch(`${PROJECT_URL}/functions/v1/`, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    });
    console.log('Functions list status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('Funzioni:', JSON.stringify(data, null, 2).substring(0, 2000));
    } else {
      console.log('Errore:', await response.text().catch(() => ''));
    }
  } catch (err) {
    console.log('Errore fetch functions:', err.message);
  }

  // 5. Verifica tabla card_prices con conteggi più dettagliati
  console.log('\n=== CARD_PRICES — DETTAGLIO ===');
  const cpAll = await supabase
    .from('card_prices')
    .select('card_id', { count: 'exact', head: true });
  console.log('card_prices righe totali:', cpAll.count);

  // Sample di card_id per capire la struttura
  const sample5 = await supabase
    .from('card_prices')
    .select('card_id, source, price, image_url, created_at')
    .limit(5);
  console.log('Sample 5 righe card_prices:');
  sample5.data?.forEach((r, i) => {
    console.log(`  [${i}] card_id=${r.card_id}, source=${r.source}, price=${r.price}, image_url=${r.image_url ? 'present' : 'null'}, created=${r.created_at}`);
  });

  // Quante righe hanno image_url non null? Scarichiamo e contiamo
  const allImgs = await supabase
    .from('card_prices')
    .select('image_url')
    .neq('image_url', null)
    .limit(100000);

  const imgsWithValue = (allImgs.data || []).filter(r => r.image_url).length;
  console.log(`  Righe con image_url non null (sample 100k): ${imgsWithValue} su ${allImgs.data?.length ?? 0}`);
  console.log(`  NOTE: se count < 100k, il totale potrebbe essere inferiore`);

  // 6. Tabelle di log/cron/alert
  console.log('\n=== VERIFICA CRON / LOG ===');
  const cronTables = ['cron_jobs', 'price_refresh_log', 'alerts'];
  for (const t of cronTables) {
    const { count, error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true });
    console.log(`  ${t}: ${error?.message?.substring(0, 80) ?? count ?? '?'}`);
  }

  console.log('\n=== FINE INVENTARIO ===');
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
