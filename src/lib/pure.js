// Funzioni pure estratte da search.js per test isolati (non richiedono
// EventEmitter/DB/Supabase). Identiche all'implementazione in search.js.

export function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function tokenize(s) {
  return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Identica a search.js: riceve input già normalizzato da norm().
export function cardCodeIlikePattern(normalizedCode, wildcard = '%') {
  return `${wildcard}${normalizedCode}${wildcard}`;
}
