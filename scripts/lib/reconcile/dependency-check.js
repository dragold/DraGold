// DraGold — Catalog Reconciliation Pipeline
// Dependency safety layer.
//
// Puramente diagnostico. Questo modulo non chiama mai Supabase direttamente —
// riceve una mappa di dipendenze già calcolata (iniettata dal chiamante, es.
// reconcile-pokemon.js in un futuro run READ-ONLY, o una fixture nei test) e
// la usa solo per ANNOTARE i findings già prodotti da classify-findings.js.
// Nessuna funzione qui decide se cancellare/fondere una riga — si limita a
// rendere visibile "cosa si romperebbe se qualcuno lo facesse", perché quella
// è una domanda separata dalla classificazione del finding stesso.
//
// Distinzione FK-enforced vs reference-only, verificata su Supabase (schema
// reale, `pimwkmwrduqkaydyvxqz`, letto in sessione di analisi read-only):
//
//   FK enforced (un DELETE/UPDATE su `cards.id` referenziato fallirebbe o
//   propagherebbe secondo il vincolo — verificato con `list_tables` verbose):
//     - card_prices.card_id                       → cards.id
//     - hot_picks.card_id                          → cards.id
//     - card_image_cache.card_id                   → cards.id
//     - canonical_cards.primary_image_card_id      → cards.id
//
//   Reference-only (colonna testo libero, NESSUN vincolo FK a livello DB —
//   più pericoloso, non meno: un merge/delete non farebbe fallire nulla,
//   romperebbe silenziosamente il riferimento):
//     - alerts.card_id
//     - posts.card_id
//     - api_call_log.card_id
//     - collection.card_api_id
//     - watchlist.card_api_id
//     - ebay_clicks.card_api_id
//     - price_history.card_api_id
//
// Questa lista NON è dichiarata definitiva: il design doc lo segnala
// esplicitamente (sezione I) — un futuro run reale contro Supabase dovrebbe
// ri-verificare lo schema prima di fidarsi ciecamente di questa costante.

export const FK_ENFORCED_TABLES = Object.freeze([
  'card_prices',
  'hot_picks',
  'card_image_cache',
  'canonical_cards_primary_image_card_id',
]);

export const REFERENCE_ONLY_TABLES = Object.freeze([
  'alerts',
  'posts',
  'api_call_log',
  'collection',
  'watchlist',
  'ebay_clicks',
  'price_history',
]);

export const ALL_DEPENDENCY_TABLES = Object.freeze([...FK_ENFORCED_TABLES, ...REFERENCE_ONLY_TABLES]);

/**
 * Costruisce una dependency map per-card unendo più mappe per-tabella, nella
 * forma in cui arriverebbero da query separate (una per tabella) contro
 * Supabase. Funzione pura: non esegue query, unisce solo dati già ottenuti.
 *
 * @param {Record<string, Record<string, number>>} countsByTable
 *   es. { card_prices: { 'pokemon:tcgdex:svp-044:en': 3 }, hot_picks: {...} }
 * @returns {Record<string, Record<string, number>>} mappa card_id → { tabella: count }
 */
export function buildDependencyMap(countsByTable) {
  const map = {};
  for (const table of ALL_DEPENDENCY_TABLES) {
    const perCard = countsByTable?.[table] || {};
    for (const [cardId, count] of Object.entries(perCard)) {
      if (!map[cardId]) map[cardId] = {};
      map[cardId][table] = count;
    }
  }
  return map;
}

/**
 * Calcola il riepilogo di dipendenze per un insieme di card id (tipicamente
 * `finding.row_ids`), separando FK-enforced da reference-only.
 *
 * @param {string[]} cardIds
 * @param {Record<string, Record<string, number>>} dependencyMap - card_id → {tabella: count}
 * @returns {{
 *   byTable: Record<string, number>,
 *   byCard: Record<string, Record<string, number>>,
 *   fkEnforcedTotal: number,
 *   referenceOnlyTotal: number,
 *   hasAnyDependency: boolean,
 *   hasFkEnforcedDependency: boolean,
 * }}
 */
export function summarizeDependencies(cardIds, dependencyMap) {
  const byTable = Object.fromEntries(ALL_DEPENDENCY_TABLES.map(t => [t, 0]));
  const byCard = {};

  for (const cardId of cardIds || []) {
    const perCard = dependencyMap?.[cardId] || {};
    byCard[cardId] = {};
    for (const table of ALL_DEPENDENCY_TABLES) {
      const count = perCard[table] || 0;
      byCard[cardId][table] = count;
      byTable[table] += count;
    }
  }

  const fkEnforcedTotal = FK_ENFORCED_TABLES.reduce((sum, t) => sum + byTable[t], 0);
  const referenceOnlyTotal = REFERENCE_ONLY_TABLES.reduce((sum, t) => sum + byTable[t], 0);

  return {
    byTable,
    byCard,
    fkEnforcedTotal,
    referenceOnlyTotal,
    hasAnyDependency: fkEnforcedTotal + referenceOnlyTotal > 0,
    hasFkEnforcedDependency: fkEnforcedTotal > 0,
  };
}

/**
 * Annota un elenco di findings (da classify-findings.js) con il riepilogo di
 * dipendenze per i loro row_ids. Non muta i findings originali — ritorna nuovi
 * oggetti (`{...finding, dependencies}`), coerente con lo stile "pure
 * functions, nessuna mutazione" del resto della pipeline.
 *
 * @param {object[]} findings
 * @param {Record<string, Record<string, number>>} dependencyMap
 * @returns {object[]}
 */
export function annotateFindingsWithDependencies(findings, dependencyMap) {
  return (findings || []).map(finding => ({
    ...finding,
    dependencies: summarizeDependencies(finding.row_ids || [], dependencyMap || {}),
  }));
}
