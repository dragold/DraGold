// DraGold — Catalog Reconciliation Pipeline
// Normalization layer, pokemontcg.io (ptcg)-sourced rows.
//
// Puramente diagnostico. Nessuna funzione qui scrive su Supabase, muta l'oggetto
// di input o inventa una regola di normalizzazione non dichiarata esplicitamente.
//
// Modulo gemello di normalize-tcgdex.js, tenuto volutamente separato invece di
// importare la stessa funzione da un modulo condiviso: le due fonti hanno
// idiosincrasie di formato indipendenti (verificato: `scripts/sync-pokemon-ptcg.js`
// scrive `card_number: c.number != null ? String(c.number) : null` — il valore
// grezzo di pokemontcg.io, mai zero-padded nei casi osservati) e potrebbero
// divergere ulteriormente in futuro (es. un nuovo campo fonte-specifico da
// normalizzare solo da un lato). La regola numerica di base è oggi identica a
// quella di normalize-tcgdex.js per costruzione — non per caso: è la stessa
// definizione conservativa di "stringa puramente numerica", duplicata
// intenzionalmente per mantenere i due moduli indipendenti e testabili in
// isolamento, non per divergenza di comportamento. Se la regola numerica
// dovesse mai cambiare, va cambiata in entrambi i file consapevolmente.

/**
 * @typedef {Object} NormalizedToken
 * @property {string|null} normalized
 * @property {boolean} wasNormalized
 * @property {string} reason
 */

/**
 * Normalizza un token `card_number` in modo conservativo (vedi normalize-tcgdex.js
 * per la stessa regola, documentata lì in dettaglio).
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
 * Estrae i campi di identità rilevanti da una riga `cards` grezza (source=ptcg),
 * senza mutare l'oggetto originale.
 *
 * @param {object} row
 * @returns {object}
 */
export function normalizePtcgRow(row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('normalizePtcgRow: row deve essere un oggetto');
  }
  const { normalized, wasNormalized, reason } = normalizeCardNumber(row.card_number);
  return {
    id: row.id ?? null,
    tcg: row.tcg ?? null,
    source: 'ptcg',
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
export function normalizePtcgRows(rows) {
  return (rows || []).filter(Boolean).map(normalizePtcgRow);
}
