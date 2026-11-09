// analyze-minified-cjs.cjs — diagnostica bundle production minificato
// Estrae informazioni dal bundle production senza fare assunzioni sul formato.

const fs = require('fs');

const BUNDLE_PATH = process.argv[2] || 'C:/Users/ermal/AppData/Local/hermes/cache/scratch/prod-check.js';
const SOURCE_JWT = process.argv[3] || 'NO_SOURCE_JWT_PROVIDED';
const SOURCE_URL = process.argv[4] || 'NO_SOURCE_URL_PROVIDED';

console.log('========================================');
console.log('ANALISI BUNDLE PRODUCTION');
console.log('========================================');
console.log('Bundle:', BUNDLE_PATH);
console.log('Dimensione:', fs.statSync(BUNDLE_PATH).size, 'byte');
console.log('');

const b = fs.readFileSync(BUNDLE_PATH, 'utf8');

// === 1. createClient chiamata ===
const ccIdx = b.indexOf('createClient(');
console.log('1. createClient(');
console.log('   Presente:', ccIdx >= 0 ? 'SÌ' : 'NO');
if (ccIdx >= 0) {
  const ctxStart = Math.max(0, ccIdx - 50);
  const ctxEnd = Math.min(b.length, ccIdx + 150);
  console.log('   Contesto:', b.substring(ctxStart, ctxEnd).replace(/\n/g, ' '));
}
console.log('');

// === 2. JWT (cerca eyJhbGci...) ===
const jwtIdx = b.indexOf('eyJhbGci');
console.log('2. JWT (eyJhbGci...)');
console.log('   Indice trovato:', jwtIdx);
if (jwtIdx >= 0) {
  // Estrai la stringa JWT dal contesto
  // Cerca il confine della stringa: dovrebbe essere tra virgolette
  const before = b.substring(Math.max(0, jwtIdx - 100), jwtIdx);
  const afterStart = jwtIdx;
  const afterEnd = Math.min(b.length, jwtIdx + 500);
  const after = b.substring(afterStart, afterEnd);

  // La JWT è probabilmente tra virgolette: cerca la virgoletta di apertura prima di eyJ
  const openQuoteBefore = before.lastIndexOf('"');
  const jwtStartInBundle = openQuoteBefore >= 0 ? openQuoteBefore + 1 : jwtIdx;
  const closeQuoteAfter = after.indexOf('"');
  const jwtEndInBundle = closeQuoteAfter >= 0 ? jwtIdx + closeQuoteAfter : jwtIdx + 208;

  const extractedJwt = b.substring(jwtStartInBundle, jwtEndInBundle);

  console.log('   JWT estratta dal bundle:');
  console.log('   Lunghezza:', extractedJwt.length);
  console.log('   Primo carattere:', extractedJwt.substring(0, 50) + '...');
  console.log('   Ultimo carattere:', extractedJwt.substring(extractedJwt.length - 20));
  console.log('');

  // Confronto con la JWT sorgente
  console.log('3. CONFRONTO JWT');
  console.log('   Source JWT lunghezza:', SOURCE_JWT.length);
  console.log('   Bundle JWT lunghezza:', extractedJwt.length);
  console.log('   Match esatto:', extractedJwt === SOURCE_JWT ? '✅ IDENTICA' : '❌ DIVERSA');
  if (extractedJwt !== SOURCE_JWT) {
    console.log('   Source inizia con:', SOURCE_JWT.substring(0, 30) + '...');
    console.log('   Bundle inizia con:', extractedJwt.substring(0, 30) + '...');
    // trova prima differenza
    let diffIdx = -1;
    const minLen = Math.min(SOURCE_JWT.length, extractedJwt.length);
    for (let i = 0; i < minLen; i++) {
      if (SOURCE_JWT[i] !== extractedJwt[i]) {
        diffIdx = i;
        break;
      }
    }
    if (diffIdx >= 0) {
      console.log('   Prima differenza all\'indice', diffIdx);
      console.log('   Source [' + diffIdx + ']:', SOURCE_JWT.substring(Math.max(0, diffIdx - 10), diffIdx + 20));
      console.log('   Bundle [' + diffIdx + ']:', extractedJwt.substring(Math.max(0, diffIdx - 10), diffIdx + 20));
    } else if (SOURCE_JWT.length !== extractedJwt.length) {
      console.log('   Differisce per lunghezza (nessuna differenza nei primi ' + minLen + ' char)');
    }
  }
} else {
  console.log('   JWT NON TROVATA nel bundle!');
}
console.log('');

// === 4. URL Supabase ===
const urlIdx = b.indexOf('.supabase.co');
console.log('4. URL Supabase');
console.log('   Indice trovato:', urlIdx);
if (urlIdx >= 0) {
  // Estrai l'URL dal contesto
  const before = b.substring(Math.max(0, urlIdx - 100), urlIdx);
  const afterStart = urlIdx;
  const afterEnd = Math.min(b.length, urlIdx + 100);
  const after = b.substring(afterStart, afterEnd);

  const openQuoteBefore = before.lastIndexOf('"');
  const urlStartInBundle = openQuoteBefore >= 0 ? openQuoteBefore + 1 : urlIdx - 30;
  const closeQuoteAfter = after.indexOf('"');
  const urlEndInBundle = closeQuoteAfter >= 0 ? urlIdx + closeQuoteAfter : urlIdx + 50;

  const extractedUrl = b.substring(urlStartInBundle, urlEndInBundle);

  console.log('   URL estratto dal bundle:', extractedUrl);
  console.log('   Match con source:', extractedUrl === SOURCE_URL ? '✅ IDENTICO' : '❌ DIVERSO');
  console.log('');
} else {
  console.log('   URL NON TROVATA nel bundle!');
}

// === 5. Patterni aggiuntivi ===
console.log('5. Pattern aggiuntivi');
console.log('   "VITE_SUPABASE_ANON_KEY" presente:', b.includes('VITE_SUPABASE_ANON_KEY') ? 'SÌ' : 'NO');
console.log('   "VITE_SUPABASE_URL" presente:', b.includes('VITE_SUPABASE_URL') ? 'SÌ' : 'NO');
console.log('   "import.meta.env" presente:', b.includes('import.meta.env') ? 'SÌ' : 'NO');
console.log('   "RootFallback" presente:', b.includes('RootFallback') ? 'SÌ' : 'NO');
console.log('   "createRoot" presente:', b.includes('createRoot') ? 'SÌ' : 'NO');
console.log('');

// === 6. Analisi della struttura della chiamata createClient ===
if (ccIdx >= 0) {
  console.log('6. Struttura chiamata createClient (detagli)');
  // Cerca l'inizio della chiamata (backtrack da createClient(
  let callStart = ccIdx;
  while (callStart > 0 && (b[callStart - 1] === ' ' || b[callStart - 1] === '\n' || b[callStart - 1] === '\t')) {
    callStart--;
  }
  // Ora callStart è all'inizio dell'identificatore prima di (
  // Cerca il nome della funzione (backtrack fino al prossimo non-identifier char)
  let funcNameStart = callStart;
  while (funcNameStart > 0 && /[a-zA-Z0-9_$.]/.test(b[funcNameStart - 1])) {
    funcNameStart--;
  }
  const funcName = b.substring(funcNameStart, callStart);
  console.log('   Nome funzione chiamante:', funcName || '(anonima/espressione)');

  // Mostra tutto il contesto della chiamata
  const callCtxStart = Math.max(0, funcNameStart - 50);
  const callCtxEnd = Math.min(b.length, ccIdx + 300);
  console.log('   Contesto completo della chiamata (50 char prima, 300 dopo):');
  console.log('   ', b.substring(callCtxStart, callCtxEnd).replace(/\n/g, ' '));
}
console.log('');
console.log('========================================');
console.log('FINE ANALISI');
console.log('========================================');
