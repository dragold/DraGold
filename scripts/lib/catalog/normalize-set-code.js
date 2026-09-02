// DraGold — Catalog Freshness (Fase 1)
// Normalizzazione set code condivisa fra discovery, reconcile e ingestion.
//
// `normalizeSetCode` riproduce ESATTAMENTE la regola gia' in produzione in
// src/lib/setSlug.js#normalizeSetKey (lowercase + rimozione di ogni carattere
// non alfanumerico) — stessa chiave con cui l'app collassa "OP-01"/"op01" e
// "sv10"/"SV10" sullo stesso set. Riusarla qui garantisce che il diff
// upstream<->DB usi la stessa nozione di identita' del resto del prodotto.
//
// `canonicalOnePieceSetId` produce la forma con cui i set One Piece sono
// realmente scritti in `cards.set_id` (verificato 2026-09-02: "OP-16",
// "EB-02", "PRB-02", "ST-30", "P") — dashed uppercase, numero a 2 cifre.

/**
 * @param {unknown} raw
 * @returns {string} lowercase, solo [a-z0-9]. Mai throw.
 */
export function normalizeSetCode(raw) {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const OP_SET_PREFIXES = ['OP', 'EB', 'PRB', 'ST'];
const OP_PREFIX_RE = new RegExp(`^(${OP_SET_PREFIXES.join('|')})[-_ ]?0*(\\d{1,3})$`, 'i');
// primo token strutturato ovunque nella stringa (gestisce le etichette TCGCSV
// combinate: "OP15-EB04" -> OP-15, "EB-03-04" -> EB-03, "OP17 RE" -> OP-17).
const OP_TOKEN_RE = new RegExp(`\\b(${OP_SET_PREFIXES.join('|')})[-_ ]?0*(\\d{1,3})\\b`, 'i');
const OP_PROMO_RE = /^p(?:romo)?(?:[-_ ]?\d+)?$/i;

/**
 * Forma canonica del set code One Piece cosi' come vive in `cards.set_id`.
 * - "OP17" / "op-17" / "OP 17" -> "OP-17"
 * - "OP15-EB04" -> "OP-15"  (etichetta combinata TCGCSV: primo token strutturato)
 * - "EB-03-04" -> "EB-03"
 * - "OP17 RE" -> "OP-17"
 * - "EB5" -> "EB-05" ; "PRB2" -> "PRB-02"
 * - "P" / "promo" / "P-1" -> "P"
 * - "OP-PR" / "OP-DD" (bucket a suffisso alfabetico) -> invariato uppercase
 * - qualunque altra cosa -> `raw` trimmato e uppercase (nessuna regola inventata)
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function canonicalOnePieceSetId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (OP_PROMO_RE.test(s)) return 'P';
  const exact = s.match(OP_PREFIX_RE);
  if (exact) return `${exact[1].toUpperCase()}-${String(Number(exact[2])).padStart(2, '0')}`;
  const token = s.match(OP_TOKEN_RE);
  if (token) return `${token[1].toUpperCase()}-${String(Number(token[2])).padStart(2, '0')}`;
  return s.toUpperCase();
}

/** true se il code e' un'espansione numerata (OP/EB/PRB), non un bucket promo. */
export function isNumberedOnePieceExpansion(code) {
  return /^(OP|EB|PRB)-\d{2}$/.test(String(code || ''));
}
/** true se il code e' uno starter/structure deck numerato. */
export function isOnePieceStarterDeck(code) {
  return /^ST-\d{2}$/.test(String(code || ''));
}
