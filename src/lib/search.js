import { JP_NAME_ALIASES } from './searchData.js';

export function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function tokenize(s) { return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
export function rankSearchResults(cards, rawQuery) {
  const q = norm(rawQuery);
  const qWords = tokenize(rawQuery);
  const aliasList = [...(JP_NAME_ALIASES[q] || []), ...qWords.flatMap(w => JP_NAME_ALIASES[w] || [])];
  const tier = (c) => {
    const n = norm(c.name || '');
    const ne = norm(c.name_en || '');
    const nWords = tokenize(c.name || '');
    const neWords = tokenize(c.name_en || '');
    const allWords = [...nWords, ...neWords];
    if (n === q) return 0;
    if (ne === q) return 1;
    if (n.startsWith(q) || ne.startsWith(q)) return 2;
    if (qWords.length <= 1) {
      const w = qWords[0] || q;
      if (w && allWords.some(word => word === w)) return 3;
      if (w && allWords.some(word => word.startsWith(w))) return 3;
    } else if (qWords.every(qw => allWords.some(word => word === qw || word.startsWith(qw)))) {
      return 4;
    }
    if (aliasList.length && aliasList.some(a => (c.name || '').includes(a))) return 5;
    return 6;
  };
  return [...cards].sort((a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta - tb;
    const cn = (a.card_number || '').localeCompare(b.card_number || '');
    if (cn !== 0) return cn;
    return (a.id || '').localeCompare(b.id || '');
  });
}
