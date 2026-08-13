// DraGold — Catalog Reconciliation Pipeline
// Normalization layer, TCGdex-sourced rows.
//
// Puramente diagnostico. Nessuna funzione qui scrive su Supabase, muta l'oggetto
// di input o inventa una regola di normalizzazione non dichiarata esplicitamente.
//
// Perché questo file esiste: il finding verificato su `svp-044` (vedi design doc,
// sezione "Finding critico") ha dimostrato che TCGdex scrive `card_number` come
// `String(c.localId)` così com'è nella fonte (`scripts/sync-full.js`), che per
// alcuni set è zero-padded (es. "044") e per altri no. Nessuno script di sync
// normalizza questo valore prima di scriverlo in `cards.card_number`. Questo
// modulo NON tocca `cards` — produce solo una vista normalizzata in memoria, da
// usare nel matching (identity-cascade.js).
//
// Regola di normalizzazione, CONSERVATIVA per costruzione:
//   - stringa puramente numerica (solo cifre)   → strip degli zeri iniziali.
//   - qualunque altra cosa (alfanumerico, vuoto, null, con lettere/simboli) →
//     MAI trasformata. Il valore normalizzato coincide col valore raw, e il motivo
//     è dichiarato esplicitamente in `reason`, per non nascondere il caso "non so
//     normalizzare questo" dentro un dato che sembra pulito.
//
// Questo file NON fa fuzzy matching. Non decide se due righe sono la stessa carta.
// Produce solo una rappresentazione più confrontabile della stessa riga.

/**
 * @typedef {Object} NormalizedToken
 * @property {string|null} normalized
 * @property {boolean} wasNormalized
 * @property {string} reason - motivo esplicito della trasformazione (o non-trasformazione)
 */

/**
 * Normalizza un token `card_number` in modo conservativo.
 * Regola: solo stringhe PURAMENTE numeriche vengono spogliate degli zeri iniziali.
 * Qualunque valore alfanumerico, vuoto o nullo resta invariato, con motivo esplicito.
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
  // Alfanumerico o altro pattern non puramente numerico: non inventiamo una regola.
  return { normalized: s, wasNormalized: false, reason: 'NON_NUMERIC_NOT_NORMALIZED' };
}

/**
 * Estrae i campi di identità rilevanti da una riga `cards` grezza (source=tcgdex),
 * senza mutare l'oggetto originale e senza aggiungere campi non presenti nello
 * schema reale (`MASTER_DATA_MODEL_AUDIT.md`, `SCHEMA_VERIFICATION_REPORT.md`).
 *
 * @param {object} row - riga grezza da `cards` (o fixture con la stessa forma)
 * @returns {object} vista normalizzata, non scritta da nessuna parte
 */
export function normalizeTcgdexRow(row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('normalizeTcgdexRow: row deve essere un oggetto');
  }
  const { normalized, wasNormalized, reason } = normalizeCardNumber(row.card_number);
  return {
    id: row.id ?? null,
    tcg: row.tcg ?? null,
    source: 'tcgdex',
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
 * Applica normalizeTcgdexRow a un array di righe. Ignora silenziosamente righe
 * nulle/undefined nell'array (difesa contro dati fixture incompleti), non le
 * scarta per errore di logica.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
export function normalizeTcgdexRows(rows) {
  return (rows || []).filter(Boolean).map(normalizeTcgdexRow);
}
