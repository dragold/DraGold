import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTcgdexRow } from '../normalize-tcgdex.js';
import { normalizePtcgRow } from '../normalize-ptcg.js';
import {
  normalizeSourceId,
  naturalKey,
  canonicalKey,
  findCanonicalSplits,
  findExactDuplicateClustersByCanonical,
  findSameSourceRepeats,
  findCrossSourceSourceIdMatches,
  findNaturalKeyCrossSourceMatches,
  findFuzzyCandidates,
  findUnmatchedRows,
  runIdentityCascade,
} from '../identity-cascade.js';

function td(row) { return normalizeTcgdexRow(row); }
function pc(row) { return normalizePtcgRow(row); }

test('normalizeSourceId: spoglia zeri iniziali nella parte numerica finale, mantiene il prefisso', () => {
  const r = normalizeSourceId('svp-044');
  assert.equal(r.normalized, 'svp-44');
  assert.equal(r.wasNormalized, true);
});

test('normalizeSourceId: pattern non riconosciuto resta invariato', () => {
  const r = normalizeSourceId('weird!!id');
  assert.equal(r.normalized, 'weird!!id');
  assert.equal(r.wasNormalized, false);
  assert.equal(r.reason, 'PATTERN_NOT_RECOGNIZED_NOT_NORMALIZED');
});

test('naturalKey: null se manca tcg/set_id/lang/card_number_normalized', () => {
  assert.equal(naturalKey({ tcg: 'pokemon', set_id: 'sv1', lang: 'en', card_number_normalized: null }), null);
  assert.equal(naturalKey({ tcg: null, set_id: 'sv1', lang: 'en', card_number_normalized: '1' }), null);
});

test('canonicalKey: include lang, non solo canonical_card_id (per design — vedi commento nel modulo)', () => {
  const a = canonicalKey({ canonical_card_id: 'X', lang: 'en' });
  const b = canonicalKey({ canonical_card_id: 'X', lang: 'fr' });
  assert.notEqual(a, b);
});

test('Pass -1: split reale svp-044/svp-44 rilevato, nomi compatibili', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: 'A', name: 'Charmander' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'B', name: 'Charmander' }),
  ];
  const { splits, collisions } = findCanonicalSplits(rows);
  assert.equal(splits.length, 1);
  assert.equal(collisions.length, 0);
  assert.deepEqual(new Set(splits[0].distinctCanonicalIds), new Set(['A', 'B']));
});

test('Pass -1: nomi chiaramente diversi sulla stessa natural key → collisione, non split', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'tk-xy-su-4', set_id: 'tk', lang: 'fr', card_number: '4', canonical_card_id: 'A', name: 'Évoli' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'tk-ex-latia-4', set_id: 'tk', lang: 'fr', card_number: '4', canonical_card_id: 'B', name: 'Latias' }),
  ];
  const { splits, collisions } = findCanonicalSplits(rows);
  assert.equal(splits.length, 0);
  assert.equal(collisions.length, 1);
});

test('Pass -1: nessun gruppo con una sola riga viene segnalato', () => {
  const rows = [td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' })];
  const { splits, collisions } = findCanonicalSplits(rows);
  assert.equal(splits.length, 0);
  assert.equal(collisions.length, 0);
});

test('Pass -1: canonical_card_id coerente su tutte le righe → nessuno split', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '01', canonical_card_id: 'A', name: 'X' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
  ];
  const { splits, collisions } = findCanonicalSplits(rows);
  assert.equal(splits.length, 0);
  assert.equal(collisions.length, 0);
});

test('Pass 0: raggruppa per (canonical_card_id, lang), NON fonde lingue diverse dello stesso canonical', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'fr', card_number: '1', canonical_card_id: 'A', name: 'X' }),
  ];
  const clusters = findExactDuplicateClustersByCanonical(rows);
  assert.equal(clusters.length, 0, 'lingue diverse dello stesso canonical non sono un duplicato');
});

test('Pass 0: stesso canonical + stessa lingua da due source → cluster', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
  ];
  const clusters = findExactDuplicateClustersByCanonical(rows);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].rows.length, 2);
});

test('Pass 1: stesso source+source_id+lang, id diversi → same source repeat', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
    td({ id: 'a-dup', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
  ];
  const clusters = findSameSourceRepeats(rows);
  assert.equal(clusters.length, 1);
});

test('Pass 2: source_id normalizzato coincide cross-source', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: 'A', name: 'X' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'A', name: 'X' }),
  ];
  const clusters = findCrossSourceSourceIdMatches(rows);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].rows.length, 2);
});

test('Pass 2: stessa fonte non produce mai un cluster (richiede distinct sources > 1)', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'X' }),
  ];
  const clusters = findCrossSourceSourceIdMatches(rows);
  assert.equal(clusters.length, 0);
});

test('Pass 3: cross-source natural key match richiede nomi compatibili', () => {
  const compatible = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: null, name: 'X' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'sv1-1', set_id: 'sv1', lang: 'en', card_number: '1', canonical_card_id: null, name: 'X' }),
  ];
  assert.equal(findNaturalKeyCrossSourceMatches(compatible).length, 1);

  const incompatible = [
    td({ id: 'c', tcg: 'pokemon', source_id: 'tk-1', set_id: 'tk', lang: 'en', card_number: '1', canonical_card_id: null, name: 'Alpha' }),
    pc({ id: 'd', tcg: 'pokemon', source_id: 'tk-1', set_id: 'tk', lang: 'en', card_number: '1', canonical_card_id: null, name: 'Beta' }),
  ];
  assert.equal(findNaturalKeyCrossSourceMatches(incompatible).length, 0);
});

test('Pass 4: nome uguale ma entrambi gli assi (set e numero) variano senza rarity condivisa → nessun cluster', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'base1-58', set_id: 'base1', lang: 'en', card_number: '58', canonical_card_id: 'A', name: 'Pikachu', rarity: 'Common' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'swshp-1', set_id: 'swshp', lang: 'en', card_number: 'SWSH001', canonical_card_id: 'B', name: 'Pikachu', rarity: 'Promo' }),
  ];
  const clusters = findFuzzyCandidates(rows, new Set());
  assert.equal(clusters.length, 0);
});

test('Pass 4: nome uguale, entrambi gli assi variano, rarity coincide → REPRINT_CANDIDATE', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'base1-4', set_id: 'base1', lang: 'en', card_number: '4', canonical_card_id: 'A', name: 'Charizard', rarity: 'Rare Holo' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'legacy-4', set_id: 'legacy', lang: 'en', card_number: '58', canonical_card_id: 'B', name: 'Charizard', rarity: 'Rare Holo' }),
  ];
  const clusters = findFuzzyCandidates(rows, new Set());
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].subtypeHint, 'REPRINT_CANDIDATE');
});

test('Pass 4: solo il set varia (numero uguale) → POSSIBLE_MIGRATED_ID_CANDIDATE', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'sv1-25', set_id: 'sv1', lang: 'en', card_number: '25', canonical_card_id: 'A', name: 'Charizard ex' }),
    pc({ id: 'b', tcg: 'pokemon', source_id: 'svp-25', set_id: 'svp', lang: 'en', card_number: '25', canonical_card_id: 'B', name: 'Charizard ex' }),
  ];
  const clusters = findFuzzyCandidates(rows, new Set());
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].subtypeHint, 'POSSIBLE_MIGRATED_ID_CANDIDATE');
});

test('Pass 4: solo il numero varia (set uguale) → VARIANT_CANDIDATE_HINT', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'promo-10', set_id: 'promo', lang: 'en', card_number: '10', canonical_card_id: 'A', name: 'Mew' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'promo-11', set_id: 'promo', lang: 'en', card_number: '11', canonical_card_id: 'B', name: 'Mew' }),
  ];
  const clusters = findFuzzyCandidates(rows, new Set());
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].subtypeHint, 'VARIANT_CANDIDATE_HINT');
});

test('Pass 4: righe già matchate da pass precedenti vengono escluse', () => {
  const rows = [
    td({ id: 'a', tcg: 'pokemon', source_id: 'promo-10', set_id: 'promo', lang: 'en', card_number: '10', canonical_card_id: 'A', name: 'Mew' }),
    td({ id: 'b', tcg: 'pokemon', source_id: 'promo-11', set_id: 'promo', lang: 'en', card_number: '11', canonical_card_id: 'B', name: 'Mew' }),
  ];
  const clusters = findFuzzyCandidates(rows, new Set(['a', 'b']));
  assert.equal(clusters.length, 0);
});

test('Pass 5: righe non abbinate da nessun matchedIds', () => {
  const rows = [td({ id: 'a', tcg: 'pokemon', source_id: 'x-1', set_id: 'x', lang: 'en', card_number: '1', canonical_card_id: 'A', name: 'Solo' })];
  const unmatched = findUnmatchedRows(rows, new Set());
  assert.equal(unmatched.length, 1);
});

test('runIdentityCascade: orchestratore completo, nessun crash su input vuoto/malformato', () => {
  assert.doesNotThrow(() => runIdentityCascade([]));
  assert.doesNotThrow(() => runIdentityCascade(null));
  assert.doesNotThrow(() => runIdentityCascade([null, undefined, { id: null }]));
});

test('runIdentityCascade: il caso reale svp-044/svp-44 finisce in splits, non in exactDuplicateClusters', () => {
  const rows = [
    td({ id: 'pokemon:tcgdex:svp-044:en', tcg: 'pokemon', source_id: 'svp-044', set_id: 'svp', lang: 'en', card_number: '044', canonical_card_id: '34e65567-97b9-4007-98ea-b94ccd82e75e', name: 'Charmander' }),
    pc({ id: 'pokemon:ptcg:svp-44', tcg: 'pokemon', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', canonical_card_id: 'e05713fc-0790-4034-a2c5-f31092004918', name: 'Charmander' }),
  ];
  const result = runIdentityCascade(rows);
  assert.equal(result.splits.length, 1);
  assert.equal(result.exactDuplicateClusters.length, 0);
  assert.equal(result.matchedRowIds.size, 2);
});
