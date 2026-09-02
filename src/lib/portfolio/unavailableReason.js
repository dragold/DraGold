// DraGold — Portfolio Core (Fase 3)
// Spiegazione UX del perché una carta non ha una valutazione. Puro.
// Tono costruttivo, mai "errore". `resolved_via_alias` NON è un problema.

const MESSAGES = {
  ja_not_covered: {
    title: 'Japanese cards',
    text: "We don't value Japanese printings yet — our market data covers English cards. Coming later.",
  },
  set_not_covered: {
    title: 'Set not covered yet',
    text: 'This set isn\'t in our valuation coverage yet. Coverage expands as we add more sets.',
  },
  no_data_yet: {
    title: 'Not enough market data',
    text: "We don't have enough recent market data for this card yet.",
  },
};

/** @param {string} reason @returns {{title:string, text:string}} */
export function explainUnavailable(reason) {
  return MESSAGES[reason] || MESSAGES.no_data_yet;
}

/** Raggruppa `unvalued` per motivo → [{ reason, title, text, cardIds }] */
export function groupUnvalued(unvalued = []) {
  const m = new Map();
  for (const u of unvalued) {
    if (u.reason === 'resolved_via_alias') continue; // non è "non valutato"
    const r = MESSAGES[u.reason] ? u.reason : 'no_data_yet';
    if (!m.has(r)) m.set(r, []);
    m.get(r).push(u.card_api_id);
  }
  return [...m.entries()]
    .map(([reason, cardIds]) => ({ reason, ...explainUnavailable(reason), cardIds }))
    .sort((a, b) => b.cardIds.length - a.cardIds.length);
}
