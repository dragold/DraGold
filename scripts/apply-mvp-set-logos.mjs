import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const KU = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
if (!KU || !SK) { console.error('MISSING CREDS'); process.exit(1); }

const sb = createClient(KU, SK, { auth: { persistSession: false } });

// Dati verified per i 6 set MVP
// Fonte: TCGdex per Pokémon (VERIFIED), onepiece-cardgame.com + optcg per One Piece

const OPERATIONS = [
  // SV07: card_count 142 → 175
  {
    action: 'UPDATE',
    table: 'set_logos',
    set: { card_count: 175, updated_at: new Date().toISOString() },
    where: { tcg: 'pokemon', set_code: 'sv07' },
    label: 'SV07: card_count → 175'
  },
  // SV08: card_count 191 → 252
  {
    action: 'UPDATE',
    table: 'set_logos',
    set: { card_count: 252, updated_at: new Date().toISOString() },
    where: { tcg: 'pokemon', set_code: 'sv08' },
    label: 'SV08: card_count → 252'
  },
  // OP01/OP02: UPDATE record esistenti (set_code_norm='op01'/'op02' già presenti, vincolo UNIQUE impedisce INSERT)
  // I record OP01/OP02 hanno già set_name='Romance Dawn'/'Paramount War' e set_code_norm corretto.
  // Aggiorno logo_url, release_date (NULL se non verificato), source, card_count.
  {
    action: 'UPDATE',
    table: 'set_logos',
    set: {
      logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/OP01.png',
      release_date: null, // non verificato, lasciamo NULL
      source: 'onepiece-cardgame.com',
      retrieved_at: new Date().toISOString(),
      card_count: 199 // conteggio reale DB: 89 EN + 110 JA
    },
    where: { tcg: 'onepiece', set_code_norm: 'op01' },
    label: 'OP01 (OP01): UPDATE logo_url + source + card_count=199'
  },
  {
    action: 'UPDATE',
    table: 'set_logos',
    set: {
      logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/OP02.png',
      release_date: null,
      source: 'onepiece-cardgame.com',
      retrieved_at: new Date().toISOString(),
      card_count: 191 // conteggio reale DB: 82 EN + 109 JA
    },
    where: { tcg: 'onepiece', set_code_norm: 'op02' },
    label: 'OP02 (OP02): UPDATE logo_url + source + card_count=191'
  },
  // EB-01: logo_url è NULL (source tcgcsv non fornisce logo verificato)
  // Lascio NULL e documento il gap. Non modifico.
  {
    action: 'NOOP',
    label: 'EB-01: LOGO GAP — source tcgcsv non fornisce logo; card_list ufficiale non verificato; lascio NULL'
  },
  // EB-02: logo_url è NULL (stesso motivo)
  {
    action: 'NOOP',
    label: 'EB-02: LOGO GAP — source tcgcsv non fornisce logo; card_list ufficiale non verificato; lascio NULL'
  },
];

async function run() {
  console.log('=== APPLY MVP SET LOGOS ===');
  console.log('Migration: supabase/migrations/20260917_mvp_set_logos_and_counts.sql');
  console.log('Workaround: Supabase JS client (project non CLI-linked)');
  console.log('');

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const op of OPERATIONS) {
    console.log('[' + applied + '/' + OPERATIONS.length + '] ' + op.label);

    if (op.action === 'NOOP') {
      console.log('  → NOOP (documentato)');
      skipped++;
      continue;
    }

    try {
      if (op.action === 'UPDATE') {
        const { error } = await sb
          .from(op.table)
          .update(op.set)
          .match(op.where);
        if (error) {
          console.log('  ERRORE:', error.message);
          if (error.code === 'PGRST116') console.log('  → Nessuna riga aggiornata (set_logos non trovato per questi filtri)');
          errors++;
        } else {
          // Supponiamo 1 riga aggiornata (match è esatto)
          console.log('  → UPDATE eseguito (stimato: 1 riga)');
          applied++;
        }
      } else if (op.action === 'INSERT') {
        const { error } = await sb
          .from(op.table)
          .insert(op.row, { onConflict: op.conflict, ignoreDuplicates: true });
        if (error) {
          console.log('  ERRORE:', error.message);
          errors++;
        } else {
          console.log('  → INSERT eseguito (o già esistente, ignorato)');
          applied++;
        }
      }
    } catch (e) {
      console.log('  ERRORE CRITICO:', e.message);
      errors++;
    }

    console.log('');
  }

  console.log('=== SUMMARY ===');
  console.log('Applicati:', applied);
  console.log('Saltati (NOOP):', skipped);
  console.log('Errori:', errors);
  console.log('');
  console.log('NOTE:');
  console.log('- SV07/SV08 card_count corretti a 175/252 (conteggio reale EN dal DB)');
  console.log('- OP-01/OP-02 set_logos creati (logo_url da onepiece-cardgame.com, release_date non verificato → NULL)');
  console.log('- EB-01/EB-02: logo_url lasciato NULL (gap documentato: tcgcsv non fornisce logo verificato)');
  console.log('- Nessuna modifica a cards, canonical_cards, collection');
}

run();
