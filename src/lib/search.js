import { JP_NAME_ALIASES } from './searchData.js';

export function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function tokenize(s) { return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
// Raggruppa varianti linguistiche/regionali della stessa carta usando ESCLUSIVAMENTE
// canonical_card_id — mai nome normalizzato, string similarity, numero carta da solo,
// set+nome o fuzzy matching. Due record con canonical_card_id diversi restano SEMPRE
// carte distinte, anche se i nomi sono identici o molto simili (es. ristampe con lo
// stesso nome in set diversi). Record con canonical_card_id nullo non vengono MAI
// raggruppati con nessun altro record (ognuno resta la propria entry, chiave fallback
// unica per id) — nessuna euristica di somiglianza viene usata come sostituto.
// Nomi carta (es. "___'s Pikachu") non vengono mai letti, normalizzati o alterati qui.
export function groupByCanonical(cards) {
  const order = [];
  const groups = new Map();
  for (const c of cards) {
    const key = c.canonical_card_id != null ? `c:${c.canonical_card_id}` : `solo:${c.id}`;
    let g = groups.get(key);
    if (!g) { g = []; groups.set(key, g); order.push(key); }
    g.push(c);
  }
  return order.map(key => {
    const group = groups.get(key);
    if (group.length === 1) return group[0];
    // Rappresentante: preferisce EN, altrimenti il primo della query (ordine già
    // deciso a monte dalla query/expand, non da similarity).
    const primary = group.find(c => c.lang === 'en') || group[0];
    const langs = [...new Set(group.map(c => c.lang).filter(Boolean))];
    return { ...primary, variantCount: group.length - 1, variantLangs: langs };
  });
}

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
