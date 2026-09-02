#!/usr/bin/env node
// DraGold — Catalog Sync Queue drainer (Fase 1).
//
// Legge i gap in `catalog_gaps` con status 'missing'/'error' (retry_count < 3),
// lancia la sincronizzazione mirata dell'entita', e aggiorna lo status:
//   missing -> syncing -> resolved   (se dopo il sync l'entita' e' in DB)
//                       -> error      (+ retry_count++, error_message)
//
// One Piece  -> runOnePieceSync({ sets: [setCode] })  (TCGCSV)
// Pokémon    -> scripts/sync-cards.js --tcg=pokemon --lang=<lang> --set=<code>
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { nextQueuedGaps, markSyncing, markResolvedById, markError } from './lib/catalog/gaps-store.js';
import { dbSetExists, dbCardNumbers } from './lib/catalog/db-read.js';
import { runOnePieceSync } from './sync-onepiece.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const val = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const LIMIT = Number(val('limit') || 25);
const DRY_RUN = args.includes('--dry-run');

function setCodeOfGap(gap) {
  if (gap.set_code) return gap.set_code;
  return String(gap.source_id || '').split('#')[0];
}

async function syncGap(gap) {
  const setCode = setCodeOfGap(gap);
  if (gap.tcg === 'onepiece') {
    const r = await runOnePieceSync({ supabase: sb, sets: [setCode], log: (m) => process.stderr.write('    ' + m + '\n') });
    if (!r.groupsProcessed) throw new Error(`nessun group TCGCSV per ${setCode}`);
    return;
  }
  if (gap.tcg === 'pokemon') {
    execFileSync('node', ['scripts/sync-cards.js', '--tcg=pokemon', `--lang=${gap.language}`, `--set=${setCode}`], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    });
    return;
  }
  throw new Error(`tcg non gestito: ${gap.tcg}`);
}

async function verifyResolved(gap) {
  const setCode = setCodeOfGap(gap);
  if (gap.entity_type === 'card' && gap.card_number) {
    const nums = await dbCardNumbers(sb, gap.tcg, gap.language, setCode);
    return nums.has(gap.card_number);
  }
  return dbSetExists(sb, gap.tcg, gap.language, setCode);
}

async function run() {
  const now = Date.now();
  const raw = await nextQueuedGaps(sb, { limit: LIMIT * 3, maxRetry: 3 });
  // Non sincronizziamo i set con release date futura: restano 'missing' finche'
  // non escono davvero (poi la transizione li rende sincronizzabili). TCGCSV
  // espone gia' i dati in pre-sale, ma DraGold non deve mostrare carte non
  // ancora ufficialmente disponibili.
  const queue = raw
    .filter((g) => !g.release_date || new Date(g.release_date).getTime() <= now)
    .slice(0, LIMIT);
  const skipped = raw.length - queue.length;
  console.error(`[catalog-sync] ${queue.length} gap sincronizzabili${skipped ? ` (${skipped} futuri, saltati)` : ''}${DRY_RUN ? ' (dry-run)' : ''}`);

  let resolved = 0, errored = 0;
  const perGap = [];

  for (const gap of queue) {
    const label = `${gap.tcg}/${gap.language} ${gap.entity_type} ${gap.source_id}`;
    if (DRY_RUN) { console.error(`  [dry-run] avrebbe sincronizzato: ${label}`); perGap.push({ gap: label, action: 'dry-run' }); continue; }

    try {
      await markSyncing(sb, gap.id);
      console.error(`  sync ${label}...`);
      await syncGap(gap);
      const ok = await verifyResolved(gap);
      if (ok) { await markResolvedById(sb, gap.id); resolved++; perGap.push({ gap: label, action: 'resolved' }); console.error(`    -> resolved`); }
      else { await markError(sb, gap.id, 'sync completato ma entita\' non trovata in DB'); errored++; perGap.push({ gap: label, action: 'error', reason: 'not-in-db' }); console.error(`    -> error (non in DB)`); }
    } catch (err) {
      await markError(sb, gap.id, err.message).catch(() => {});
      errored++;
      perGap.push({ gap: label, action: 'error', reason: err.message });
      console.error(`    -> error: ${err.message}`);
    }
  }

  console.log('CATALOG_SYNC_REPORT=' + JSON.stringify({ processed: queue.length, resolved, errored, perGap }));
}

run().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
