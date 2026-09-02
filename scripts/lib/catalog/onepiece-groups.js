// DraGold — Catalog Freshness (Fase 1)
// Mapping condiviso: group TCGCSV (categoryId 68) -> entita' catalogo One Piece.
// Usato sia da catalog-freshness.js (discovery/diff) sia da sync-onepiece.js
// (ingestion) — una sola regola di normalizzazione group->setCode.

import { canonicalOnePieceSetId, normalizeSetCode } from './normalize-set-code.js';
import { classifyEntityType } from './classify-entity.js';

/** true se l'etichetta indica un set "Release Event Cards" (promo di prerelease). */
export function isReleaseEventGroup(group) {
  return /\bRE\b/i.test(group.abbreviation || '') || /release\s*event/i.test(group.name || '');
}

/**
 * @param {Array} groups - output di listTcgcsvGroups(68)
 * @returns {Array<{groupId, groupName, publishedOn, isSupplemental, setCode, entityType, isReleaseEvent}>}
 *   deduplicato per setCode normalizzato (primo gruppo vince).
 */
export function mapOnePieceGroups(groups) {
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    const abbr = g.abbreviation || '';
    const base = canonicalOnePieceSetId(abbr || g.name);
    const isRE = isReleaseEventGroup(g);
    const setCode = isRE ? `${base}-RE` : base;
    const key = normalizeSetCode(setCode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      groupId: g.groupId,
      groupName: g.name,
      publishedOn: g.publishedOn || null,
      isSupplemental: Boolean(g.isSupplemental),
      setCode,
      isReleaseEvent: isRE,
      entityType: isRE ? 'promo' : classifyEntityType({
        tcg: 'onepiece', setCode, abbreviation: abbr,
        groupName: g.name, isSupplemental: g.isSupplemental,
      }),
    });
  }
  return out;
}
