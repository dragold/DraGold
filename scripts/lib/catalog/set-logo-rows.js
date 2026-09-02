// DraGold — Catalog Freshness (Fase 1)
// Trasformazione set upstream -> riga `set_logos` v2. Puro.
//
// `status`: 'upcoming' se released_on e' futura, altrimenti 'released'. Le
// transizioni successive (released -> available -> complete) sono derivate
// altrove dai conteggi carte; qui produciamo lo stato iniziale.

function statusFor(releasedOn, today = new Date()) {
  if (!releasedOn) return 'announced';
  return new Date(releasedOn) > today ? 'upcoming' : 'released';
}

/**
 * @param {{code,name,releaseDate,cardCountOfficial,logo,symbol,serieId,serieName}} s - da mapTcgdexSet
 * @param {Date} [today]
 * @returns {object} riga set_logos (tcg='pokemon')
 */
export function tcgdexSetToLogoRow(s, today = new Date()) {
  return {
    set_code: s.code,
    tcg: 'pokemon',
    set_name: s.name || s.code,
    logo_url: s.logo || null,
    symbol_url: s.symbol || null,
    release_date: s.releaseDate || null,
    released_on: s.releaseDate || null,
    status: statusFor(s.releaseDate, today),
    card_count: Number.isFinite(s.cardCountOfficial) ? s.cardCountOfficial : null,
    series_id: s.serieId || null,
    series_name: s.serieName || null,
    source: 'tcgdex',
    source_confidence: s.releaseDate ? 'high' : 'medium',
  };
}

/**
 * @param {{setCode,groupName,publishedOn,entityType}} g - da mapOnePieceGroups
 * @param {Date} [today]
 * @returns {object|null} riga set_logos (tcg='onepiece'); null per i bucket
 *   promo generici (P/OTHER) che non sono un set con identita' propria.
 */
export function tcgcsvGroupToLogoRow(g, today = new Date()) {
  if (!g || !g.setCode) return null;
  // i bucket a suffisso alfabetico (OP-PR, OP-DD, ...) non sono set con logo/data propria
  if (/^(OP|EB|PRB|ST)-[A-Z]{2}$/.test(g.setCode)) return null;
  return {
    set_code: g.setCode,
    tcg: 'onepiece',
    set_name: g.groupName || g.setCode,
    logo_url: null,       // TCGCSV non fornisce logo di set
    symbol_url: null,
    release_date: g.publishedOn || null,
    released_on: g.publishedOn || null,
    status: statusFor(g.publishedOn, today),
    card_count: null,
    series_id: null,
    series_name: null,
    source: 'tcgcsv',
    source_confidence: g.publishedOn ? 'high' : 'low',
  };
}

export { statusFor };
