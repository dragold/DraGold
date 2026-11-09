// check-functions-http.mjs — verifica funzioni via HTTP con service key
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('PROJECT_URL:', PROJECT_URL);
console.log('SERVICE_KEY:', SERVICE_KEY.substring(0, 20) + '… (len=' + SERVICE_KEY.length + ')');

// 1. Test lista funzioni via API HTTP
console.log('\n=== 1. FUNZIONI VIA API HTTP (GET /functions/v1/) ===');
try {
  const res = await fetch(`${PROJECT_URL}/functions/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
} catch (err) {
  console.log('Errore:', err.message);
}

// 2. Test invocazione funzione specifica via HTTP POST
console.log('\n=== 2. INVOCAZIONE sync-prices-multi VIA HTTP ===');
try {
  const res = await fetch(`${PROJECT_URL}/functions/v1/sync-prices-multi`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      card_ids: ['pokemon:tcgdex:S12a-212:ja'],
      sources: ['tcgdex']
    })
  });
  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
} catch (err) {
  console.log('Errore:', err.message);
}

// 3. Test cache-image via HTTP
console.log('\n=== 3. INVOCAZIONE cache-image VIA HTTP ===');
try {
  const res = await fetch(`${PROJECT_URL}/functions/v1/cache-image`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      card_id: 'pokemon:tcgdex:S12a-212:ja',
      source: 'tcgdex'
    })
  });
  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
} catch (err) {
  console.log('Errore:', err.message);
}

// 4. Verifica se il DB è raggiungibile con la chiave corrente
console.log('\n=== 4. DB CONNECTIVITY CHECK ===');
try {
  const res = await fetch(`${PROJECT_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  console.log('REST API status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 300));
} catch (err) {
  console.log('Errore:', err.message);
}

// 5. Verifica il .vercel project.json
console.log('\n=== 5. VERCEL PROJECT INFO ===');
try {
  const vercelInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '../.vercel/project.json'), 'utf-8'));
  console.log('Vercel project:', JSON.stringify(vercelInfo, null, 2));
} catch (err) {
  console.log('Errore lettura .vercel:', err.message);
}

console.log('\n=== FINE ===');
