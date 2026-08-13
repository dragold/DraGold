#!/usr/bin/env node
// DraGold — Catalog Reconciliation Pipeline, entry point Pokémon.
//
// ============================================================================
// FASE ATTUALE: IMPLEMENTAZIONE OFFLINE. Questo script NON si connette a
// Supabase, non legge né scrive dati reali. Opera esclusivamente su fixture
// locali (scripts/lib/reconcile/__fixtures__/pokemon-cases.js). Qualunque
// integrazione futura con Supabase (anche solo in lettura) è un passo
// separato, da autorizzare esplicitamente — vedi il commento in fondo al file
// ("Prossimo step: integrazione READ-ONLY") per la forma che avrebbe, non
// implementata qui.
//
// Nessuna delle funzioni importate qui scrive mai su `cards`/`canonical_cards`,
// fa merge, cancella righe, o sceglie automaticamente una fonte primaria.
// Vedi i singoli moduli in scripts/lib/reconcile/ per i dettagli.
// ============================================================================
//
// Uso:
//   node scripts/reconcile-pokemon.js                    → esegue tutti i casi fixture, stampa un riepilogo
//   node scripts/reconcile-pokemon.js --case=case-25-canonical-identity-split-real-svp-044
//                                                          → esegue un solo caso, stampa il dettaglio completo
//   node scripts/reconcile-pokemon.js --out=report.json    → scrive anche il report completo su file locale
//   node scripts/reconcile-pokemon.js --list               → elenca gli id dei casi fixture disponibili

import { writeFileSync } from 'node:fs';
import { normalizeTcgdexRow } from './lib/reconcile/normalize-tcgdex.js';
import { normalizePtcgRow } from './lib/reconcile/normalize-ptcg.js';
import { runIdentityCascade } from './lib/reconcile/identity-cascade.js';
import { classifyFindings } from './lib/reconcile/classify-findings.js';
import { annotateFindingsWithDependencies, buildDependencyMap } from './lib/reconcile/dependency-check.js';
import { POKEMON_TEST_CASES } from './lib/reconcile/__fixtures__/pokemon-cases.js';

/**
 * Sceglie il normalizzatore corretto in base a `row.source`. Dispatcher
 * volutamente qui (orchestratore) e non dentro i moduli normalize-*.js, che
 * restano single-purpose per fonte (vedi commenti in quei file).
 *
 * @param {object} row
 * @returns {object}
 */
function normalizeRow(row) {
  if (row.source === 'tcgdex') return normalizeTcgdexRow(row);
  if (row.source === 'ptcg') return normalizePtcgRow(row);
  // Fonti non-Pokémon (es. optcg/One Piece) usate nelle fixture per
  // dimostrare che classify-findings.js è source-agnostico: nessun
  // normalizzatore dedicato esiste ancora per loro (fuori scope, CLAUDE.md
  // §1 — "zero lavoro attivo" su altri TCG). Fallback strutturale esplicito,
  // MAI silenzioso: la regola numerica di normalizeCardNumber è identica per
  // costruzione tra i moduli esistenti, quindi riusarla non introduce un
  // comportamento nascosto — solo l'etichetta `source` originale è preservata.
  return { ...normalizeTcgdexRow(row), source: row.source };
}

/**
 * Esegue l'intera pipeline (normalize → cascade → classify → dependency
 * annotation) su un singolo caso fixture. Pure rispetto all'esterno: non
 * scrive nulla, ritorna solo il risultato.
 *
 * @param {object} testCase - una entry di POKEMON_TEST_CASES
 * @returns {{ id: string, findings: object[] } | null} null se il caso è un gap dichiarato (skip)
 */
function runCase(testCase) {
  if (testCase.expect?.skip) return null;

  const normalizedRows = testCase.rows.map(normalizeRow);
  const cascade = runIdentityCascade(normalizedRows);
  let findings = classifyFindings(cascade, normalizedRows, testCase.options || {});

  if (testCase.dependencyMap) {
    const perTable = {};
    for (const [cardId, counts] of Object.entries(testCase.dependencyMap)) {
      for (const [table, count] of Object.entries(counts)) {
        perTable[table] = perTable[table] || {};
        perTable[table][cardId] = count;
      }
    }
    findings = annotateFindingsWithDependencies(findings, buildDependencyMap(perTable));
  }

  return { id: testCase.id, description: testCase.description, findings };
}

function summarize(results) {
  const byFinding = {};
  const byConfidence = {};
  let total = 0;
  for (const result of results) {
    if (!result) continue;
    for (const f of result.findings) {
      total += 1;
      byFinding[f.finding] = (byFinding[f.finding] || 0) + 1;
      byConfidence[f.confidence] = (byConfidence[f.confidence] || 0) + 1;
    }
  }
  return { totalFindings: total, byFinding, byConfidence, casesRun: results.filter(Boolean).length, casesSkipped: results.filter(r => r === null).length };
}

function parseArgs(argv) {
  const args = { case: null, out: null, list: false };
  for (const arg of argv) {
    if (arg === '--list') args.list = true;
    else if (arg.startsWith('--case=')) args.case = arg.slice('--case='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('Casi fixture disponibili (scripts/lib/reconcile/__fixtures__/pokemon-cases.js):');
    for (const c of POKEMON_TEST_CASES) {
      console.log(`  ${c.id}${c.gap ? '  [GAP DICHIARATO]' : ''}`);
    }
    return;
  }

  const casesToRun = args.case
    ? POKEMON_TEST_CASES.filter(c => c.id === args.case)
    : POKEMON_TEST_CASES;

  if (args.case && casesToRun.length === 0) {
    console.error(`Nessun caso fixture con id "${args.case}". Usa --list per vedere gli id disponibili.`);
    process.exitCode = 1;
    return;
  }

  const results = casesToRun.map(runCase);
  const report = {
    mode: 'OFFLINE_FIXTURE',
    generated_at: new Date().toISOString(),
    note: 'Report puramente diagnostico. Nessuna scrittura Supabase eseguita da questo script. Vedi header del file per lo scope della fase corrente.',
    summary: summarize(results),
    results: results.filter(Boolean),
  };

  console.log(JSON.stringify(report, null, 2));

  if (args.out) {
    writeFileSync(args.out, JSON.stringify(report, null, 2), 'utf8');
    console.error(`\nReport scritto anche su file locale: ${args.out}`);
  }
}

main();

// ============================================================================
// PROSSIMO STEP (non implementato qui, richiede autorizzazione separata):
// integrazione READ-ONLY contro Supabase reale.
//
// Forma prevista (SOLO commento — nessun codice eseguibile):
//
//   async function fetchRowsForScope(supabase, { tcg, setId, lang }) {
//     const { data, error } = await supabase
//       .from('cards')
//       .select('id,tcg,source,source_id,set_id,lang,card_number,canonical_card_id,name,name_en,image_url,image_url_hi,rarity,print_variant,metadata')
//       .eq('tcg', tcg).eq('set_id', setId).eq('lang', lang);
//     if (error) throw error;
//     return data;
//   }
//
//   async function fetchDependencyCounts(supabase, cardIds) {
//     // una query per tabella (card_prices, hot_picks, card_image_cache,
//     // alerts, posts, api_call_log, collection, watchlist, ebay_clicks,
//     // price_history), aggregata con dependency-check.js#buildDependencyMap.
//     // SOLO SELECT/count — mai UPDATE/DELETE.
//   }
//
// Questo script continuerebbe a NON scrivere mai su Supabase in nessuna fase
// futura: la scrittura (merge/dedup) resta, per design, un task separato e
// esplicitamente autorizzato a parte (vedi design doc, sezione G).
// ============================================================================
