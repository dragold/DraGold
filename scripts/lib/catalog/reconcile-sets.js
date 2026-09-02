// DraGold — Catalog Freshness (Fase 1)
// Diff SET-level fra catalogo upstream e catalogo DraGold. Puro.
//
// "missing" = set upstream la cui chiave normalizzata NON e' fra le chiavi dei
// set gia' presenti in DraGold (derivate da cards.set_id distinti).
// "extra"   = set presente in DraGold, mai visto upstream in questo scope
//             (diagnostico: set_id sporco, o fonte incompleta — LOW confidence).

import { normalizeSetCode } from './normalize-set-code.js';

/**
 * @param {object} opts
 * @param {{code:string, name?:string|null, releaseDate?:string|null,
 *          entityType?:string, source:string, sourceId?:string}[]} opts.upstreamSets
 * @param {Set<string>} opts.dbSetCodesNorm - chiavi normalizeSetCode dei set gia' in DraGold
 * @returns {{missing:object[], extra:string[], matched:object[]}}
 */
export function diffSets({ upstreamSets, dbSetCodesNorm } = {}) {
  if (!Array.isArray(upstreamSets)) throw new TypeError('diffSets: "upstreamSets" deve essere un array');
  const dbKeys = dbSetCodesNorm instanceof Set ? dbSetCodesNorm : new Set(dbSetCodesNorm || []);

  const missing = [];
  const matched = [];
  const seenUpstream = new Set();

  for (const s of upstreamSets) {
    const key = normalizeSetCode(s.code);
    if (!key) continue;
    seenUpstream.add(key);
    if (dbKeys.has(key)) matched.push(s);
    else missing.push(s);
  }

  const extra = [...dbKeys].filter((k) => !seenUpstream.has(k));
  return { missing, extra, matched };
}
