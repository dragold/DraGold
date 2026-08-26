// DraGold — Catalog Reconciliation Pipeline
// Normalization layer, One Piece (optcg)-sourced rows.
//
// Puramente diagnostico. Nessuna funzione qui scrive su Supabase, muta l'oggetto
// di input o inventa una regola di normalizzazione non dichiarata esplicitamente.
//
// Modulo gemello di normalize-tcgdex.js/normalize-ptcg.js, stessa forma di riga
// in ingresso (le colonne di `cards`, non il JSON grezzo di una fonte esterna —
// il mapping da JSON grezzo a questa forma comune è, per costruzione dell'intero
// modulo reconcile, un passo di fetch/ingestion separato, non di normalize).
//
// Perché questo file esiste ora e non prima: `reconcile-pokemon.js` (vedi
// `normalizeRow()` lì) trattava finora le righe One Piece con un fallback
// esplicito su `normalizeTcgdexRow` più override di `source` — dichiarato nel
// commento lì come "nessun normalizzatore dedicato esiste ancora per loro
// (fuori scope, CLAUDE.md §1)". Con l'allargamento di scope della reconciliation
// a One Piece EN/JA (richiesto esplicitamente), quel fallback implicito va
// sostituito da un modulo dedicato ed esplicito — stessa logica di oggi, ma
// dichiarata come propria di One Piece invece di "presa in prestito" da TCGdex,
// così un domani che le due regole divergano il cambiamento è locale a questo
// file, non a un fallback condiviso con Pokémon.
//
// Differenza di forma verificata rispetto a Pokémon (da `scripts/sync-cards.js`,
// funzione `syncOnePiece()`/`parseBandaiPage()`): per One Piece `card_number` e
// `source_id` sono la STESSA stringa completa "<set_code>-<numero>" (es.
// "OP01-001", "ST01-001", "P-001"), mai un numero puro isolato dal set code
// come accade per Pokémon ("044", "62"). Di conseguenza la regola
// "solo cifre pure -> strip zeri iniziali" di normalizeCardNumber non scatta MAI
// su dati One Piece reali osservati (nessuna stringa `card_number` One Piece è
// mai stata vista puramente numerica) — non è un bug, è la regola conservativa
// che si comporta correttamente lasciando il valore invariato quando non sa
// come normalizzarlo, esattamente come documentato in normalize-tcgdex.js.
// La regola è duplicata qui (non importata da un modulo condiviso) per la
// stessa ragione di indipendenza già spiegata in normalize-ptcg.js.

/**
 * @typedef {Object} NormalizedToken
 * @property {string|null} normalized
 * @property {boolean} wasNormalized
 * @property {string} reason
 */

/**
 * Normalizza un token `card_number` in modo conservativo (stessa regola di
 * normalize-tcgdex.js/normalize-ptcg.js, duplicata qui intenzionalmente).
 *
 * @param {string|number|null|undefined} raw
 * @returns {NormalizedToken}
 */
export function normalizeCardNumber(raw) {
  if (raw === null || raw === undefined) {
    return { normalized: null, wasNormalized: false, reason: 'NULL_INPUT' };
  }
  const s = String(raw).trim();
  if (s === '') {
    return { normalized: '', wasNormalized: false, reason: 'EMPTY_INPUT' };
  }
  if (/^\d+$/.test(s)) {
    const stripped = s.replace(/^0+(?=\d)/, '');
    return {
      normalized: stripped,
      wasNormalized: stripped !== s,
      reason: stripped !== s ? 'LEADING_ZEROS_STRIPPED' : 'ALREADY_NORMAL_FORM',
    };
  }
  return { normalized: s, wasNormalized: false, reason: 'NON_NUMERIC_NOT_NORMALIZED' };
}

/**
 * Estrae i campi di identità rilevanti da una riga `cards` grezza (source=optcg),
 * senza mutare l'oggetto originale.
 *
 * @param {object} row
 * @returns {object}
 */
export function normalizeOptcgRow(row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('normalizeOptcgRow: row deve essere un oggetto');
  }
  const { normalized, wasNormalized, reason } = normalizeCardNumber(row.card_number);
  return {
    id: row.id ?? null,
    tcg: row.tcg ?? null,
    source: 'optcg',
    source_id: row.source_id ?? null,
    set_id: row.set_id ?? null,
    lang: row.lang ?? null,
    canonical_card_id: row.canonical_card_id ?? null,
    name: row.name ?? null,
    name_en: row.name_en ?? null,
    image_url: row.image_url ?? null,
    image_url_hi: row.image_url_hi ?? null,
    rarity: row.rarity ?? null,
    print_variant: row.print_variant ?? null,
    card_number_raw: row.card_number ?? null,
    card_number_normalized: normalized,
    card_number_was_normalized: wasNormalized,
    card_number_normalization_reason: reason,
    _raw: row,
  };
}

/**
 * @param {object[]} rows
 * @returns {object[]}
 */
export function normalizeOptcgRows(rows) {
  return (rows || []).filter(Boolean).map(normalizeOptcgRow);
}
