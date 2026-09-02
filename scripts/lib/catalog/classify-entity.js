// DraGold — Catalog Freshness (Fase 1)
// Classificazione dell'entita' upstream: 'set' | 'promo' | 'special' | 'product'.
// Puro. Regole esplicite, nessuna euristica nascosta.
//
// - 'promo'   : carte promozionali / release event / tournament / anniversary /
//               championship / pre-release / winner / prize / black star.
// - 'special' : contenuti a tiratura limitata non-promo (es. box topper, gift
//               set con carte esclusive) segnalati come supplemental.
// - 'product' : deck / starter / ultra deck / premium collection senza numerazione
//               di espansione propria — utile per il catalogo, non per il KPI
//               "released but missing" di carte singolari.
// - 'set'     : espansione principale (OP-xx, EB-xx, PRB-xx) o set Pokémon.

import { normalizeSetCode, isNumberedOnePieceExpansion, isOnePieceStarterDeck } from './normalize-set-code.js';

const PROMO_RE = /\b(promo|promos|promotion|promotional|black\s*star|winner|pre[-\s]?release|prerelease|championship|tournament|anniversary|release\s*event|\bprize\b|treasure\s*cup|store\s*championship|regional|gift\s*with\s*purchase|revision\s*pack)\b/i;
const PRODUCT_RE = /\b(starter\s*deck|structure\s*deck|ultra\s*deck|deck\s*set|premium\s*collection|gift\s*box|gift\s*collection|trainer\s*kit|battle\s*deck|starter\s*set|demo\s*deck|collection\s*sets?)\b/i;
const OP_STRUCTURED_SET_RE = /^(op|eb|prb)\d{1,3}$/;
const OP_STARTER_RE = /^st\d{1,3}$/;

/**
 * @param {{tcg?:string, setCode?:string|null, groupName?:string|null,
 *          abbreviation?:string|null, isSupplemental?:boolean}} input
 * @returns {'set'|'promo'|'special'|'product'}
 */
export function classifyEntityType({ tcg, setCode, groupName, abbreviation, isSupplemental } = {}) {
  const codeNorm = normalizeSetCode(setCode || abbreviation || '');
  const text = `${groupName || ''} ${abbreviation || ''} ${setCode || ''}`;

  // Promo bucket One Piece: set_id "P" o abbreviazioni "... RE" (release event).
  if (codeNorm === 'p' || /\bre\b/i.test(abbreviation || '')) return 'promo';
  if (PROMO_RE.test(text)) return 'promo';

  if (tcg === 'onepiece') {
    const code = setCode || abbreviation || '';
    if (isNumberedOnePieceExpansion(code) || OP_STRUCTURED_SET_RE.test(codeNorm)) return 'set';
    if (isOnePieceStarterDeck(code) || OP_STARTER_RE.test(codeNorm)) return 'product';
    if (PRODUCT_RE.test(text)) return 'product';
    // codice One Piece non-strutturato (OP-PR, OP-DD, OP-CS, ...) -> bucket promo,
    // mai un "set mancante" (in DB questi vivono sotto set_id 'P'/'OTHER').
    return 'promo';
  }

  if (PRODUCT_RE.test(text)) return 'product';
  if (isSupplemental) return 'special';
  return 'set';
}
