// End-to-end offline test: ogni caso in __fixtures__/pokemon-cases.js viene
// fatto passare attraverso normalize → identity-cascade → classify-findings
// (→ dependency-check dove richiesto), e il risultato viene confrontato con
// l'esito atteso dichiarato nella fixture stessa.
//
// Nessuna chiamata Supabase, nessuna scrittura, nessuna rete. Puramente offline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTcgdexRow } from '../normalize-tcgdex.js';
import { normalizePtcgRow } from '../normalize-ptcg.js';
import { runIdentityCascade } from '../identity-cascade.js';
import { classifyFindings } from '../classify-findings.js';
import { annotateFindingsWithDependencies, buildDependencyMap } from '../dependency-check.js';
import { POKEMON_TEST_CASES } from '../__fixtures__/pokemon-cases.js';

function normalizeRow(row) {
  if (row.source === 'tcgdex') return normalizeTcgdexRow(row);
  if (row.source === 'ptcg') return normalizePtcgRow(row);
  // optcg (One Piece) e altre fonti non hanno ancora un normalizzatore
  // dedicato in questa fase (scope Pokémon-first, vedi CLAUDE.md §1) — per i
  // casi di test cross-TCG (case 13) usiamo il normalizzatore tcgdex come
  // fallback strutturale: la regola numerica è identica per costruzione, solo
  // l'etichetta `source` cambia rispetto a quella scritta nella riga.
  return { ...normalizeTcgdexRow(row), source: row.source };
}

function findingMatches(finding, matcher) {
  return Object.entries(matcher).every(([key, expected]) => finding[key] === expected);
}

function describeFindings(findings) {
  return findings.map(f => ({ finding: f.finding, subtype: f.subtype, confidence: f.confidence, recommended_action: f.recommended_action }));
}

for (const testCase of POKEMON_TEST_CASES) {
  test(`${testCase.id}: ${testCase.description}`, () => {
    if (testCase.expect?.skip) {
      // Gap dichiarato esplicitamente nella fixture (vedi commento in
      // pokemon-cases.js) — nessuna asserzione eseguibile in questa fase,
      // intenzionalmente, per non fingere una copertura che non esiste.
      return;
    }

    const normalizedRows = testCase.rows.map(normalizeRow);
    const cascade = runIdentityCascade(normalizedRows);
    let findings = classifyFindings(cascade, normalizedRows, testCase.options || {});

    if (testCase.dependencyMap) {
      const perTable = {};
      for (const [cardId, counts] of Object.entries(testCase.dependencyMap)) {
        for (const [table, count] of Object.entries(counts)) {
          perTable[table] = perTable[table] || {};
          perTable[table][cardId] = count;
        }
      }
      findings = annotateFindingsWithDependencies(findings, buildDependencyMap(perTable));
    }

    const { expect: exp } = testCase;

    if (exp.findingsCount !== undefined) {
      assert.equal(findings.length, exp.findingsCount, `findings count mismatch — got ${JSON.stringify(describeFindings(findings))}`);
    }

    for (const matcher of exp.mustInclude || []) {
      const found = findings.some(f => findingMatches(f, matcher));
      assert.ok(found, `expected finding matching ${JSON.stringify(matcher)}, got ${JSON.stringify(describeFindings(findings))}`);
    }

    for (const matcher of exp.mustNotInclude || []) {
      const found = findings.some(f => findingMatches(f, matcher));
      assert.ok(!found, `did NOT expect a finding matching ${JSON.stringify(matcher)}, got ${JSON.stringify(describeFindings(findings))}`);
    }

    if (testCase.expectDependencies) {
      const dup = findings.find(f => f.finding === 'EXACT_DUPLICATE' && f.dependencies);
      assert.ok(dup, 'expected an EXACT_DUPLICATE finding with dependencies attached');
      for (const [key, value] of Object.entries(testCase.expectDependencies)) {
        assert.equal(dup.dependencies[key], value, `dependencies.${key}`);
      }
    }

    if (testCase.expectFieldCompletenessAsymmetry) {
      const dup = findings.find(f => f.finding === 'EXACT_DUPLICATE');
      assert.ok(dup, 'expected an EXACT_DUPLICATE finding for completeness asymmetry check');
      const notes = dup.evidence.field_completeness_asymmetry || [];
      for (const expected of testCase.expectFieldCompletenessAsymmetry) {
        const note = notes.find(n => n.field === expected.field);
        assert.ok(note, `expected completeness note for field "${expected.field}", got ${JSON.stringify(notes)}`);
        assert.deepEqual([...note.missing_on_sources].sort(), [...expected.missing_on_sources].sort());
      }
    }
  });
}

test('sanity: nessun finding ha mai confidence VERIFIED se proviene dal Pass 4 fuzzy', () => {
  for (const testCase of POKEMON_TEST_CASES) {
    if (testCase.expect?.skip) continue;
    const normalizedRows = testCase.rows.map(normalizeRow);
    const cascade = runIdentityCascade(normalizedRows);
    const findings = classifyFindings(cascade, normalizedRows, testCase.options || {});
    for (const f of findings) {
      const isFuzzyDerived = f.evidence?.note?.includes('matching fuzzy');
      if (isFuzzyDerived) {
        assert.notEqual(f.confidence, 'VERIFIED', `Pass 4 non deve mai produrre VERIFIED — violato in ${testCase.id}`);
        assert.notEqual(f.confidence, 'HIGH', `Pass 4 non deve mai produrre HIGH — violato in ${testCase.id}`);
      }
    }
  }
});

test('sanity: nessun finding propone mai un valore di recommended_action distruttivo (DELETE/MERGE/AUTO-FIX)', () => {
  const FORBIDDEN = ['DELETE', 'MERGE', 'AUTO_FIX', 'AUTO-FIX', 'CANONICAL_MERGE'];
  for (const testCase of POKEMON_TEST_CASES) {
    if (testCase.expect?.skip) continue;
    const normalizedRows = testCase.rows.map(normalizeRow);
    const cascade = runIdentityCascade(normalizedRows);
    const findings = classifyFindings(cascade, normalizedRows, testCase.options || {});
    for (const f of findings) {
      assert.ok(!FORBIDDEN.includes(f.recommended_action), `recommended_action distruttivo trovato in ${testCase.id}: ${f.recommended_action}`);
    }
  }
});
