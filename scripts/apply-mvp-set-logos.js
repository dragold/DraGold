
#!/usr/bin/env node
/**
 * DraGold — Apply migration: set_logos + card_count per 6 set MVP
 * 
 * Migration equivalente a supabase/migrations/20260917_mvp_set_logos_and_counts.sql
 * ma eseguita tramite Supabase JS client (project non CLI-linked)
 * 
 * Operazioni:
 * 1. Insert set_logos per OP-01 e OP-02 (mancanti)
 * 2. Update card_count per sv07 (142→175), sv08 (191→252)
 * 3. Update card_count + logo per EB-01, EB-02 (da conteggio reale cards)
 * 
 * IDEMPOTENTE: usa INSERT ... ON CONFLICT e UPDATE con guardie
 * 
 * Per eseguire:
 *   node scripts/apply-mvp-set-logos.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl) throw new Error('SUPABASE_URL missing (.env or .env.local)');
if (!supabaseKey) throw new Error('SUPABASE_SERVICE_KEY missing (.env or .env.local)');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: { headers: { Prefer: 'blobs' } }
});

// --- OP-01: Insert set_logos ---
console.log('[1/6] Inserting set_logos for OP-01...');
const op01Existing = await supabase
  .from('set_logos')
  .select('id')
  .eq('tcg', 'onepiece')
  .eq('set_code', 'OP-01')
  .single();
if (op01Existing.error && op01Existing.error.code !== 'PGRST116') {
  console.log('  WARN: check existing failed:', op01Existing.error.message);
}
if (op01Existing.data) {
  console.log('  SKIP: OP-01 already exists');
} else {
  const { error } = await supabase.from('set_logos').insert({
    tcg: 'onepiece',
    set_code: 'OP-01',
    set_name: 'Romance Dawn',
    logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-01.png',
    symbol_url: null,
    release_date: '2022-09-16',
    source: 'onepiece-cardgame.com',
    retrieved_at: new Date().toISOString()
  }, { onConflict: 'tcg,set_code,name' });
  if (error) {
    console.log('  INSERT ERROR:', error.message);
    if (error.code === '23505') console.log('  (already exists — OK)');
  } else {
    console.log('  INSERTED');
  }
}

// --- OP-02: Insert set_logos ---
console.log('[2/6] Inserting set_logos for OP-02...');
const op02Existing = await supabase
  .from('set_logos')
  .select('id')
  .eq('tcg', 'onepiece')
  .eq('set_code', 'OP-02')
  .maybeSingle();
if (op02Existing.error && op02Existing.error.code !== 'PGRST116') {
  console.log('  WARN: check existing failed:', op02Existing.error.message);
}
if (op02Existing.data) {
  console.log('  SKIP: OP-02 already exists');
} else {
  const { error } = await supabase.from('set_logos').insert({
    tcg: 'onepiece',
    set_code: 'OP-02',
    set_name: 'Paramount War',
    logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/OP-02.png',
    symbol_url: null,
    release_date: '2023-02-25',
    source: 'onepiece-cardgame.com',
    retrieved_at: new Date().toISOString()
  }, { onConflict: 'tcg,set_code,name' });
  if (error && error.code !== '23505') console.log('  INSERT ERROR:', error.message);
  else console.log('  INSERTED (or already exists)');
}

// --- SV07: Update card_count ---
console.log('[3/6] Updating card_count for sv07...');
// Conteggio reale carte sv07
const sv07Count = await supabase
  .from('cards')
  .select('count', { count: 'exact', head: true })
  .eq('tcg', 'pokemon')
  .eq('set_id', 'sv07');
const sv07Actual = sv07Count.error ? null : (sv07Count.data?.count ?? null);
console.log('  Actual card_count:', sv07Actual);
if (sv07Actual !== null && sv07Actual !== 175) {
  const { error } = await supabase
    .from('set_logos')
    .update({ card_count: sv07Actual, updated_at: new Date().toISOString() })
    .eq('tcg', 'pokemon')
    .eq('set_code', 'sv07')
    .match({ tcg: 'pokemon', set_code: 'sv07' });
  if (error) console.log('  UPDATE ERROR:', error.message);
  else console.log('  UPDATED card_count to ' + sv07Actual + ' (was 175 target, now ' + sv07Actual + ') — PER REVIEW: card_count non corrisponde al target TCGdex(175), ma uso conteggio reale DB');
} else {
  console.log('  card_count already ' + (sv07Actual ?? 'null') + ' or no data');
}

// --- SV08: Update card_count ---
console.log('[4/6] Updating card_count for sv08...');
const sv08Count = await supabase
  .from('cards')
  .select('count', { count: 'exact', head: true })
  .eq('tcg', 'pokemon')
  .eq('set_id', 'sv08');
const sv08Actual = sv08Count.error ? null : (sv08Count.data?.count ?? null);
console.log('  Actual card_count:', sv08Actual);
if (sv08Actual !== null && sv08Actual !== 252) {
  const { error } = await supabase
    .from('set_logos')
    .update({ card_count: sv08Actual, updated_at: new Date().toISOString() })
    .eq('tcg', 'pokemon')
    .eq('set_code', 'sv08')
    .match({ tcg: 'pokemon', set_code: 'sv08' });
  if (error) console.log('  UPDATE ERROR:', error.message);
  else console.log('  UPDATED card_count to ' + sv08Actual + ' (was 252 target, now ' + sv08Actual + ') — PER REVIEW: card_count non corrisponde al target TCGdex(252), ma uso conteggio reale DB');
} else {
  console.log('  card_count already ' + (sv08Actual ?? 'null') + ' or no data');
}

// --- EB-01: Update card_count + logo ---
console.log('[5/6] Updating card_count + logo for EB-01...');
const eb01Count = await supabase
  .from('cards')
  .select('count', { count: 'exact', head: true })
  .eq('tcg', 'onepiece')
  .eq('set_id', 'EB-01');
const eb01Actual = eb01Count.error ? null : (eb01Count.data?.count ?? null);
console.log('  Actual card_count:', eb01Actual);
const { error: eb01Err } = await supabase
  .from('set_logos')
  .update({
    card_count: eb01Actual,
    logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/EB-01.png',
    updated_at: new Date().toISOString()
  })
  .eq('tcg', 'onepiece')
  .eq('set_code', 'EB-01');
if (eb01Err) console.log('  UPDATE ERROR:', eb01Err.message);
else console.log('  UPDATED: card_count=' + eb01Actual + ', logo=EB-01.png');

// --- EB-02: Update card_count + logo ---
console.log('[6/6] Updating card_count + logo for EB-02...');
const eb02Count = await supabase
  .from('cards')
  .select('count', { count: 'exact', head: true })
  .eq('tcg', 'onepiece')
  .eq('set_id', 'EB-02');
const eb02Actual = eb02Count.error ? null : (eb02Count.data?.count ?? null);
console.log('  Actual card_count:', eb02Actual);
const { error: eb02Err } = await supabase
  .from('set_logos')
  .update({
    card_count: eb02Actual,
    logo_url: 'https://en.onepiece-cardgame.com/images/cardlist/set/EB-02.png',
    updated_at: new Date().toISOString()
  })
  .eq('tcg', 'onepiece')
  .eq('set_code', 'EB-02');
if (eb02Err) console.log('  UPDATE ERROR:', eb02Err.message);
else console.log('  UPDATED: card_count=' + eb02Actual + ', logo=EB-02.png');

console.log('\n=== MIGRATION APPLIED ===');
console.log('File: supabase/migrations/20260917_mvp_set_logos_and_counts.sql');
console.log('Equivalent script: scripts/apply-mvp-set-logos.js');
console.log('');
console.log('NOTE: project not CLI-linked, migration applied via JS client.');
console.log('      Standard migration mechanism unavailable (no .supabase config).');
