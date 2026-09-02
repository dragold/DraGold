// DraGold — Catalog Freshness (Fase 1)
// Chiave di confronto per il diff card-level, per-tcg.
//
// - Pokémon: TCGdex scrive `localId` a volte zero-padded ("001") a volte no
//   ("1"); `cards.card_number` in DB e' gia' strip-zeri per i set numerici
//   (verificato 2026-09-02: set "me4" -> "1","10","100"). Riusiamo la regola
//   conservativa gia' testata in scripts/lib/reconcile/normalize-tcgdex.js
//   (solo stringhe puramente numeriche -> strip zeri iniziali; tutto il resto
//   invariato).
// - One Piece: il "Number" TCGCSV e' "OP17-020"; `cards.card_number_norm` in
//   DB e' lowercase + rimozione non-alfanumerici ("op16001"). Usiamo la stessa
//   regola (normalizeSetCode) su entrambi i lati.

import { normalizeCardNumber } from '../reconcile/normalize-tcgdex.js';
import { normalizeSetCode } from './normalize-set-code.js';

/** @param {unknown} raw @returns {string} */
export function pokemonCardKey(raw) {
  return normalizeCardNumber(raw).normalized ?? '';
}

/** @param {unknown} raw @returns {string} */
export function onepieceCardKey(raw) {
  return normalizeSetCode(raw);
}

/**
 * @param {'pokemon'|'onepiece'} tcg
 * @param {unknown} raw
 * @returns {string}
 */
export function cardNumberKey(tcg, raw) {
  return tcg === 'onepiece' ? onepieceCardKey(raw) : pokemonCardKey(raw);
}
