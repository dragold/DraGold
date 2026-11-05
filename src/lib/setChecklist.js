// DraGold — Set checklist (Collection Layer: set completion loop).
// Pure module, no I/O, no React.
//
// Ownership must be checked against EVERY row a deduped tile stands for.
// groupByCanonical() (lib/search.js) collapses Pokémon cards ingested by two
// independent pipelines (tcgdex + pokemontcg.io) into one tile whose `id` is
// the representative row only; the other rows live in `variantEntries`. A
// user who added the non-representative row from a search result or a card
// page still owns that card — checking `card.id` alone made the set page
// count it as missing.

/** Every cards.id a (possibly deduped) tile represents. */
export function idsForCard(card) {
  const ids = new Set();
  if (card?.id) ids.add(card.id);
  for (const v of card?.variantEntries || []) if (v?.id) ids.add(v.id);
  return [...ids];
}

/**
 * Owned quantity for one tile = sum over the rows it represents.
 * @param {object} card
 * @param {Map<string, number>} qtyById  collection.card_api_id -> quantity
 */
export function ownedQty(card, qtyById) {
  if (!qtyById) return 0;
  let n = 0;
  for (const id of idsForCard(card)) n += Number(qtyById.get(id) || 0);
  return n;
}

/** The collection row id to act on for a tile: the one already owned, else the representative. */
export function ownedRowId(card, qtyById) {
  for (const id of idsForCard(card)) if (Number(qtyById?.get(id) || 0) > 0) return id;
  return card?.id || null;
}

/** @returns {{ owned:number, total:number, missing:number, pct:number }} */
export function computeSetProgress(cards = [], qtyById) {
  const total = cards.length;
  let owned = 0;
  for (const c of cards) if (ownedQty(c, qtyById) > 0) owned++;
  const pct = total > 0 ? Math.round((owned / total) * 1000) / 10 : 0;
  return { owned, total, missing: total - owned, pct };
}

/** mode: 'all' | 'owned' | 'missing' */
export function filterByOwnership(cards = [], qtyById, mode = 'all') {
  if (mode === 'owned') return cards.filter(c => ownedQty(c, qtyById) > 0);
  if (mode === 'missing') return cards.filter(c => ownedQty(c, qtyById) === 0);
  return cards;
}
