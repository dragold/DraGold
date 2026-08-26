#!/usr/bin/env node
// scripts/lib/reconcile/smoke-reconcile.mjs
//
// Smoke test END-TO-END READ-ONLY per la Catalog Reconciliation Pipeline
// (vedi CATALOG_RECOVERY_DRYRUN_DESIGN.md). Verifica che STEP 1
// (supabase-read.js) + STEP 2 (normalizzatori esistenti) + STEP 3
// (image-taxonomy.js) funzionino insieme su dati REALI di Supabase — nessun
// dato inventato, nessuna scrittura.
//
// Scope: UN SOLO set Pokémon JA, scelto automaticamente fra quelli con un
// numero contenuto di carte (20-100) — mai un set_id hardcoded/assunto: la
// scelta avviene interrogando Supabase in sola lettura ad ogni esecuzione
// (vedi pickSmallJaSet più sotto).
//
// ============================================================================
// GARANZIE DI SOLA LETTURA
// ============================================================================
// - Verso Supabase: usa ESCLUSIVAMENTE fetchAllCardsForReconciliation /
//   fetchDbCatalogSlice da ./supabase-read.js — che, come garantito e testato
//   in quel modulo, chiama solo .select().eq().order().range() sul client.
//   Questo file stesso non chiama mai .insert/.update/.upsert/.delete sul
//   client Supabase.
// - Verso le fonti immagine: usa ESCLUSIVAMENTE auditCardImages da
//   ./image-taxonomy.js, che fa solo richieste HTTP GET/HEAD in lettura verso
//   l'host dell'immagine (mai verso Supabase).
// - Il report finale viene scritto SOLO su disco locale (writeFileSync),
//   nessuna chiamata di rete per la scrittura del report stesso.
//
// ============================================================================
// Client Supabase: stesso pattern già in uso in scripts/sync-cards.js
// ============================================================================
// SUPABASE_URL e SUPABASE_SERVICE_KEY letti da env, nessun nuovo meccanismo di
// configurazione introdotto — stessa modalità con cui l'utente fornisce già
// queste variabili agli altri script di questo repo (sync-cards.js,
// reconcile-pokemon.js in futuro, ecc.). Questo script non decide da solo
// come procurarsele: se mancano, si ferma con un errore esplicito invece di
// procedere con un client non funzionante o inventare un fallback.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/lib/reconcile/smoke-reconcile.mjs \
//     [--out=data/reconciliation/smoke-pokemon-ja.json] [--min=20] [--max=50]
//
// ============================================================================
// FIX 2026-08-17: statement timeout reale su Supabase, diagnosticato e
// risolto qui (nessun indice creato, nessun timeout aumentato)
// ============================================================================
// La prima esecuzione reale è fallita con SUPABASE_READ_FAILED / statement
// timeout (code=57014) sulla query di discovery "tutte le righe pokemon/ja,
// ORDER BY id, range 0-999". Diagnosticato con EXPLAIN read-only diretto su
// Supabase (schema/indici NON modificati — vedi il commento "ORDER BY id +
// LIMIT/OFFSET..." in supabase-read.js per il dettaglio completo): quella
// combinazione (tcg+lang filtrati, MA ordinati per `id`, con LIMIT/OFFSET)
// fa scegliere al planner Postgres l'indice sbagliato (`cards_pkey` invece di
// `cards_tcg_lang_idx`), degenerando in una scansione di gran parte delle
// 201k righe totali di `cards` invece delle sole ~8k pokemon/ja.
// Fix applicato: la sola query di *discovery* qui sotto (pickSmallJaSet, che
// serve solo a contare le righe per set_id — l'ordine non le interessa)
// ora passa `orderById: false` a supabase-read.js, verificato via EXPLAIN
// che così usa `cards_tcg_lang_idx` correttamente. La lettura del set scelto
// (fetchDbCatalogSlice più sotto, con `setId` nel filtro) NON è stata
// toccata: verificato via EXPLAIN che quel caso era già economico
// (usa `cards_set_idx`, poche righe, Sort trascurabile).

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchAllCardsForReconciliation, fetchDbCatalogSlice } from './supabase-read.js';
import { normalizeTcgdexRow } from './normalize-tcgdex.js';
import { normalizePtcgRow } from './normalize-ptcg.js';
import { auditCardImages, IMAGE_STATUS } from './image-taxonomy.js';

const args = process.argv.slice(2);
const OUT = args.find((a) => a.startsWith('--out='))?.split('=')[1] || 'data/reconciliation/smoke-pokemon-ja.json';
const MIN_SIZE = Number(args.find((a) => a.startsWith('--min='))?.split('=')[1] || 20);
const MAX_SIZE = Number(args.find((a) => a.startsWith('--max='))?.split('=')[1] || 50);

/**
 * Sceglie il normalizzatore corretto in base a `row.source` — stesso
 * dispatcher già usato in scripts/reconcile-pokemon.js#normalizeRow, ma qui
 * SENZA il fallback silenzioso su TCGdex per fonti sconosciute che quel file
 * usa per le fixture One Piece: questo smoke test opera su dati REALI, quindi
 * una fonte non riconosciuta deve fermare l'esecuzione con un errore
 * esplicito, mai indovinare quale normalizzatore applicare.
 *
 * @param {object} row
 * @returns {object}
 */
export function normalizeRow(row) {
  if (row.source === 'tcgdex') return normalizeTcgdexRow(row);
  if (row.source === 'ptcg') return normalizePtcgRow(row);
  throw new Error(
    `smoke-reconcile: nessun normalizzatore per source="${row.source}" (card id=${row.id}) — mi fermo invece di indovinare quale usare, vedi le regole del task.`
  );
}

/**
 * Interroga Supabase in sola lettura per i set Pokémon JA disponibili e
 * sceglie il più piccolo con un numero di carte compreso in [min, max].
 * Legge SOLO set_id/set_name (colonne minime) per tutte le righe pokemon/ja,
 * paginando via fetchAllCardsForReconciliation — nessun set_id assunto o
 * hardcoded: il risultato dipende interamente da cosa c'è davvero nel DB al
 * momento dell'esecuzione.
 *
 * `orderById: false` (vedi il blocco "FIX 2026-08-17" in testa al file): qui
 * l'ordine delle righe lette è irrilevante (si sta solo contando per
 * set_id), e passare `orderById: false` fa scegliere al planner Postgres
 * `cards_tcg_lang_idx` invece di degenerare in una scansione quasi completa
 * di `cards` — verificato con EXPLAIN read-only sul progetto reale, nessun
 * indice creato/modificato, nessun timeout aumentato. Questo NON è ancora una
 * soluzione generale per una futura scansione ordinata dell'intero
 * catalogo — è specifico di "l'ordine non serve", vero solo per questo
 * conteggio.
 *
 * @param {object} client - client Supabase reale (o compatibile, per i test)
 * @param {{min?: number, max?: number}} [opts]
 * @returns {Promise<{set_id: string, set_name: string|null, n: number}>}
 */
export async function pickSmallJaSet(client, { min = MIN_SIZE, max = MAX_SIZE } = {}) {
  const rows = await fetchAllCardsForReconciliation(client, {
    tcg: 'pokemon',
    lang: 'ja',
    columns: ['set_id', 'set_name'],
    pageSize: 1000,
    orderById: false,
  });

  const bySet = new Map();
  for (const r of rows) {
    if (!r.set_id) continue;
    if (!bySet.has(r.set_id)) bySet.set(r.set_id, { set_id: r.set_id, set_name: r.set_name, n: 0 });
    bySet.get(r.set_id).n += 1;
  }

  const candidates = [...bySet.values()]
    .filter((s) => s.n >= min && s.n <= max)
    .sort((a, b) => a.n - b.n || a.set_id.localeCompare(b.set_id));

  if (candidates.length === 0) {
    throw new Error(`smoke-reconcile: nessun set pokemon/ja trovato con un numero di carte fra ${min} e ${max}.`);
  }
  return candidates[0];
}

/**
 * Costruisce il report finale a partire dalle righe DB già normalizzate e dai
 * risultati di image-taxonomy.js. Funzione pura (nessun I/O) — separata
 * apposta dal resto per essere verificabile con dati sintetici senza rete
 * reale (vedi la verifica di wiring eseguita durante questo step).
 *
 * Per lo `image_status`/`http_status`/`content_type` "principali" di ogni
 * carta si usa image_url_hi quando presente, altrimenti image_url — stessa
 * priorità già codificata in `coalesce(image_url_hi, image_url)` dentro
 * `public.search_cards()` (002_data_architecture.sql): non è una scelta
 * nuova, è la stessa convenzione già in uso nel resto della codebase.
 *
 * @param {{tcg: string, lang: string, set: {set_id: string, set_name: string|null}}} scope
 * @param {object[]} dbRows - righe grezze da supabase-read.js (non normalizzate)
 * @param {{image_url: object, image_url_hi: object}[]} auditResults - stesso ordine di dbRows
 * @returns {object}
 */
export function buildReport({ tcg, lang, set }, dbRows, auditResults) {
  const images = {
    [IMAGE_STATUS.OK]: 0,
    [IMAGE_STATUS.MISSING]: 0,
    [IMAGE_STATUS.BROKEN]: 0,
    [IMAGE_STATUS.INVALID]: 0,
    [IMAGE_STATUS.FETCH_ERROR]: 0,
  };
  const cards = [];
  let imageUrlPresent = 0;
  let imageUrlMissing = 0;
  const sources = new Set();

  dbRows.forEach((row, i) => {
    const audit = auditResults[i];
    if (row.image_url) imageUrlPresent += 1;
    else imageUrlMissing += 1;
    if (row.source) sources.add(row.source);

    const primary = audit.image_url_hi.url ? audit.image_url_hi : audit.image_url;
    images[primary.status] = (images[primary.status] || 0) + 1;

    cards.push({
      id: row.id,
      source: row.source,
      source_id: row.source_id,
      set_id: row.set_id,
      card_number: row.card_number,
      name: row.name,
      image_url: row.image_url,
      image_url_hi: row.image_url_hi,
      image_status: primary.status,
      http_status: primary.httpStatus,
      content_type: primary.contentType,
      image_url_audit: audit.image_url,
      image_url_hi_audit: audit.image_url_hi,
    });
  });

  return {
    mode: 'SMOKE_TEST_READ_ONLY',
    generated_at: new Date().toISOString(),
    scope: { tcg, lang, set_id: set.set_id, set_name: set.set_name },
    db_total: dbRows.length,
    source: [...sources].join(',') || null,
    image_url_present: imageUrlPresent,
    image_url_missing: imageUrlMissing,
    images,
    cards,
  };
}

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY mancanti in env (stesso requisito di scripts/sync-cards.js).');
    process.exitCode = 1;
    return;
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('[smoke-reconcile] Ricerca set Pokémon JA disponibili (READ-ONLY)...');
  const set = await pickSmallJaSet(client, { min: MIN_SIZE, max: MAX_SIZE });
  console.log(`[smoke-reconcile] Set scelto: ${set.set_id} — "${set.set_name}" (${set.n} carte nel DB)`);

  console.log('[smoke-reconcile] Lettura righe reali del set (READ-ONLY, supabase-read.js)...');
  const dbRows = await fetchDbCatalogSlice(client, { tcg: 'pokemon', lang: 'ja', setId: set.set_id });
  if (dbRows.length !== set.n) {
    console.error(
      `[smoke-reconcile] ATTENZIONE: il conteggio della fase di discovery (${set.n}) non coincide con la lettura reale (${dbRows.length}) — il DB potrebbe essere cambiato fra le due query. Proseguo con i ${dbRows.length} dati appena letti (fonte di verità più recente).`
    );
  }

  console.log(`[smoke-reconcile] Normalizzazione di ${dbRows.length} righe...`);
  // Normalizza per intero (usa/verifica il normalizzatore corretto per ogni riga,
  // mai un fallback silenzioso) anche se questo smoke test riporta soprattutto i
  // campi grezzi — la normalizzazione va comunque eseguita ed è ciò che STEP 3 in
  // avanti consumerà (identity-cascade/classify-findings), non solo un passo
  // decorativo.
  const normalized = dbRows.map(normalizeRow);

  console.log(`[smoke-reconcile] Audit immagini (rete reale verso gli host immagine, MAI verso Supabase) per ${dbRows.length} carte...`);
  const auditResults = [];
  for (const row of dbRows) {
    // Sequenziale, non in parallelo: uno smoke test su un set piccolo (20-100
    // carte) non ha bisogno di concorrenza, ed evita di bombardare l'host
    // immagine con burst di richieste — coerente con lo spirito di rate
    // limiting già presente nell'infrastruttura riusata (crawl-images.mjs).
    auditResults.push(await auditCardImages(row));
    process.stdout.write('.');
  }
  console.log('');

  const report = buildReport({ tcg: 'pokemon', lang: 'ja', set }, dbRows, auditResults);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`[smoke-reconcile] Report scritto SOLO localmente in: ${OUT}`);

  console.log('\n=== SET SCELTO ===');
  console.log(`${report.scope.set_id} — "${report.scope.set_name}" — ${report.db_total} carte (source: ${report.source})`);

  console.log('\n=== CONTEGGIO STATI IMMAGINE ===');
  for (const [k, v] of Object.entries(report.images)) console.log(`  ${k}: ${v}`);

  console.log('\n=== ESEMPI REALI (primi 5) ===');
  for (const c of report.cards.slice(0, 5)) {
    console.log(`  ${c.id} | ${c.card_number} | ${c.name} -> ${c.image_status} (http=${c.http_status}, content-type=${c.content_type})`);
  }

  console.log(`\n_normalized_count_check: ${normalized.length} righe normalizzate (atteso ${dbRows.length})`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error('FATAL:', err.message);
    process.exitCode = 1;
  });
}
