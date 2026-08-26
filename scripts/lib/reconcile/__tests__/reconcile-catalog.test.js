import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runSetReconciliation,
  runReconcileCatalog,
  readCheckpoint,
  normalizeDbRow,
  tagExternalCandidates,
  tagDbRows,
  classifyMissingExtraByOrigin,
  classifyFindingsForReconciliation,
  partitionCanonicalSplits,
  EXTERNAL_SOURCE_FETCHERS,
  SourceNotImplementedError,
} from '../reconcile-catalog.mjs';
import { runIdentityCascade } from '../identity-cascade.js';
import { OptcgSourceNotImplementedError } from '../sources/fetch-optcg.js';

// ============================================================================
// Mock client Supabase — stesso pattern di __tests__/supabase-read.test.js
// (.from().select().eq().order().range(), thenable; write methods sono spie).
// ============================================================================
function createMockClient({ responses } = {}) {
  const writeAttempts = { insert: 0, update: 0, upsert: 0, delete: 0 };
  let callIndex = 0;
  const client = {
    from() {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        range() {
          const idx = callIndex++;
          const resp = (responses && responses[idx]) || { data: [], error: null };
          builder._promise = Promise.resolve(resp);
          return builder;
        },
        then(resolve, reject) {
          return (builder._promise || Promise.resolve({ data: [], error: null })).then(resolve, reject);
        },
        insert(...a) { writeAttempts.insert += 1; return builder; },
        update(...a) { writeAttempts.update += 1; return builder; },
        upsert(...a) { writeAttempts.upsert += 1; return builder; },
        delete(...a) { writeAttempts.delete += 1; return builder; },
      };
      return builder;
    },
  };
  return { client, writeAttempts };
}

function mockFetchJson(handler) {
  return async (url) => {
    const body = handler(url);
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
}

// ============================================================================
// normalizeDbRow / tag* / classifyMissingExtraByOrigin — unità pure
// ============================================================================

describe('normalizeDbRow', () => {
  test('dispatch tcgdex/ptcg/optcg corretto', () => {
    assert.equal(normalizeDbRow({ id: 'a', source: 'tcgdex', card_number: '1' }).source, 'tcgdex');
    assert.equal(normalizeDbRow({ id: 'b', source: 'ptcg', card_number: '1' }).source, 'ptcg');
    assert.equal(normalizeDbRow({ id: 'c', source: 'optcg', card_number: 'OP01-1' }).source, 'optcg');
  });

  test('source sconosciuta -> errore esplicito, mai un fallback silenzioso', () => {
    assert.throws(() => normalizeDbRow({ id: 'x', source: 'mystery' }), /nessun normalizzatore/);
  });
});

describe('tagExternalCandidates / tagDbRows', () => {
  test('assegna un id sintetico stabile e ritagga source con suffisso ":external"', () => {
    const normalized = [normalizeDbRow({ source: 'tcgdex', source_id: 'svp-1', card_number: '1', name: 'X' })];
    const tagged = tagExternalCandidates(normalized, { tcg: 'pokemon', lang: 'en', setId: 'svp' });
    assert.equal(tagged[0].id, 'external:pokemon:en:svp:svp-1');
    assert.equal(tagged[0].source, 'tcgdex:external');
    assert.equal(tagged[0]._origin, 'external');
  });

  test('id sintetico è deterministico (stesso input -> stesso id, niente Math.random/Date.now)', () => {
    const normalized = [normalizeDbRow({ source: 'tcgdex', source_id: 'svp-1', card_number: '1' })];
    const a = tagExternalCandidates(normalized, { tcg: 'pokemon', lang: 'en', setId: 'svp' });
    const b = tagExternalCandidates(normalized, { tcg: 'pokemon', lang: 'en', setId: 'svp' });
    assert.equal(a[0].id, b[0].id);
  });

  test('riga esterna senza source_id -> errore esplicito, mai un id inventato', () => {
    const normalized = [normalizeDbRow({ source: 'tcgdex', source_id: null, card_number: '1' })];
    assert.throws(
      () => tagExternalCandidates(normalized, { tcg: 'pokemon', lang: 'en', setId: 'svp' }),
      /senza source_id/
    );
  });

  test('tagDbRows aggiunge _origin: db senza alterare altri campi', () => {
    const normalized = [normalizeDbRow({ id: 'real-1', source: 'tcgdex', source_id: 'svp-1', card_number: '1' })];
    const tagged = tagDbRows(normalized);
    assert.equal(tagged[0]._origin, 'db');
    assert.equal(tagged[0].id, 'real-1');
    assert.equal(tagged[0].source, 'tcgdex');
  });
});

describe('classifyMissingExtraByOrigin', () => {
  test('origin=external -> MISSING, origin=db -> EXTRA', () => {
    const rows = [
      { id: 'external:pokemon:en:svp:svp-9', _origin: 'external', source: 'tcgdex:external', source_id: 'svp-9', set_id: 'svp', card_number_raw: '9', name: 'Solo esterna' },
      { id: 'real-1', _origin: 'db', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', card_number_raw: '1', name: 'Solo DB' },
    ];
    const findings = classifyMissingExtraByOrigin(rows);
    assert.equal(findings[0].finding, 'MISSING');
    assert.equal(findings[0].recommended_action, 'INGEST_CANDIDATE');
    assert.equal(findings[1].finding, 'EXTRA');
    assert.equal(findings[1].recommended_action, 'REVIEW');
  });
});

// ============================================================================
// Riproduzione end-to-end (mock) del caso reale svp-044/svp-44 (già noto dal
// design doc) applicato al confronto DB<->esterno: stessa carta, card_number
// normalizzato uguale, source diverso (db='tcgdex' vs esterno='tcgdex:external')
// -> deve emergere come EXACT_DUPLICATE via Pass 3 (natural key cross-source),
// MAI come MISSING/EXTRA.
// ============================================================================

describe('classifyFindingsForReconciliation — integrazione con identity-cascade reale', () => {
  test('carta presente in DB e nella fonte esterna con lo stesso natural key -> match cross-source (EXACT_DUPLICATE), non MISSING/EXTRA', () => {
    // canonical_card_id NON impostato sulla riga DB: una riga candidata esterna
    // non ha mai un canonical_card_id (non esiste ancora in DB) — se la riga DB
    // ne avesse uno mentre l'esterna no, il match cadrebbe correttamente sotto
    // Pass -1 (CANONICAL_IDENTITY_SPLIT), non sotto Pass 3 (vedi il commento di
    // identity-cascade.js#findCanonicalSplits: canonical presente su un solo
    // lato È un mismatch, per design). Questo test isola invece il caso "nessun
    // segnale di canonical su nessuno dei due lati", che è quello atteso quando
    // una carta esiste in DB ma non ha ancora un canonical_card_id assegnato.
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '044', name: 'Pikachu' }),
    ]);
    const externalRows = tagExternalCandidates(
      [normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', name: 'Pikachu' })],
      { tcg: 'pokemon', lang: 'en', setId: 'svp' }
    );
    const allRows = [...dbRows, ...externalRows];
    const cascade = runIdentityCascade(allRows);
    const findings = classifyFindingsForReconciliation(cascade, allRows);

    const missingOrExtra = findings.filter((f) => f.finding === 'MISSING' || f.finding === 'EXTRA');
    assert.equal(missingOrExtra.length, 0, 'una carta matchata non deve MAI apparire come MISSING o EXTRA');
    const dup = findings.find((f) => f.finding === 'EXACT_DUPLICATE');
    assert.ok(dup, 'ci si aspetta un EXACT_DUPLICATE (match cross-source db<->esterno)');
    assert.equal(dup.row_ids.length, 2);
  });

  test('carta solo nella fonte esterna -> MISSING; carta solo in DB -> EXTRA', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', name: 'Solo DB' }),
    ]);
    const externalRows = tagExternalCandidates(
      [normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-2', set_id: 'svp', lang: 'en', card_number: '2', name: 'Solo esterna' })],
      { tcg: 'pokemon', lang: 'en', setId: 'svp' }
    );
    const allRows = [...dbRows, ...externalRows];
    const cascade = runIdentityCascade(allRows);
    const findings = classifyFindingsForReconciliation(cascade, allRows);

    const missing = findings.find((f) => f.finding === 'MISSING');
    const extra = findings.find((f) => f.finding === 'EXTRA');
    assert.ok(missing);
    assert.equal(missing.row_ids[0], externalRows[0].id);
    assert.ok(extra);
    assert.equal(extra.row_ids[0], 'real-1');
  });
});

// ============================================================================
// Regressione 2026-08-17: falso CANONICAL_IDENTITY_SPLIT/SOURCE_CONFLICT su
// ogni match DB<->external, diagnosticato e corretto su SVLN-001 (vedi il
// commento "Fix 2026-08-17" in reconcile-catalog.mjs per il dettaglio).
// ============================================================================

describe('partitionCanonicalSplits', () => {
  test('DB canonical + external null (SOLO) -> artefatto, non split genuino (caso reale SVLN-001)', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'SVLN-001', set_id: 'SVLN', lang: 'ja', card_number: '001', name: 'マンタイン', canonical_card_id: 'canon-real' }),
    ]);
    const externalRows = tagExternalCandidates(
      [normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'SVLN-001', set_id: 'SVLN', lang: 'ja', card_number: '1', name: 'マンタイン' })],
      { tcg: 'pokemon', lang: 'ja', setId: 'SVLN' }
    );
    const allRows = [...dbRows, ...externalRows];
    const cascade = runIdentityCascade(allRows);
    assert.equal(cascade.splits.length, 1, 'identity-cascade.js deve comunque rilevare il "mismatch" grezzo (comportamento suo invariato)');

    const { genuineSplits, externalNullArtifacts } = partitionCanonicalSplits(cascade.splits);
    assert.equal(genuineSplits.length, 0);
    assert.equal(externalNullArtifacts.length, 1);
    assert.equal(externalNullArtifacts[0].naturalKey, 'pokemon|SVLN|1|ja');
  });

  test('DB canonical A + DB canonical B (nessun external) -> split GENUINO, invariato', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-A', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '044', name: 'Pikachu', canonical_card_id: 'canon-A' }),
      normalizeDbRow({ id: 'real-B', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-44b', set_id: 'svp', lang: 'en', card_number: '44', name: 'Pikachu', canonical_card_id: 'canon-B' }),
    ]);
    const cascade = runIdentityCascade(dbRows);
    const { genuineSplits, externalNullArtifacts } = partitionCanonicalSplits(cascade.splits);
    assert.equal(genuineSplits.length, 1, 'due canonical_card_id DIVERSI fra righe DB reali resta un\'anomalia genuina');
    assert.equal(externalNullArtifacts.length, 0);
    assert.deepEqual(genuineSplits[0].distinctCanonicalIds.sort(), ['canon-A', 'canon-B']);
  });

  test('DB canonical + DB null (nessun external) -> split GENUINO, comportamento precedente invariato', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-A', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '044', name: 'Pikachu', canonical_card_id: 'canon-A' }),
      normalizeDbRow({ id: 'real-B', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-44b', set_id: 'svp', lang: 'en', card_number: '44', name: 'Pikachu' }), // canonical_card_id assente: record DB reale, potenziale anomalia
    ]);
    const cascade = runIdentityCascade(dbRows);
    const { genuineSplits, externalNullArtifacts } = partitionCanonicalSplits(cascade.splits);
    assert.equal(genuineSplits.length, 1, 'un record DB persistito senza canonical_card_id resta un\'anomalia potenziale, anche senza righe external coinvolte');
    assert.equal(externalNullArtifacts.length, 0);
    assert.equal(genuineSplits[0].hasNullCanonical, true);
  });

  test('riga senza _origin -> errore esplicito, mai una classificazione silenziosa errata', () => {
    const rowSenzaOrigin = normalizeDbRow({ id: 'x', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', canonical_card_id: 'c1' });
    const rowAltra = { ...normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1' }), id: 'y' };
    const fakeSplit = [{ naturalKey: 'pokemon|svp|1|en', rows: [rowSenzaOrigin, rowAltra], distinctCanonicalIds: ['c1'], hasNullCanonical: true }];
    assert.throws(() => partitionCanonicalSplits(fakeSplit), /senza _origin valido/);
  });
});

describe('classifyFindingsForReconciliation — regressione SVLN-001 (nessun falso SPLIT/CONFLICT)', () => {
  test('match perfetto DB<->external con canonical_card_id solo lato DB -> EXACT_DUPLICATE, MAI CANONICAL_IDENTITY_SPLIT/SOURCE_CONFLICT', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'pokemon:tcgdex:SVLN-001:ja', tcg: 'pokemon', source: 'tcgdex', source_id: 'SVLN-001', set_id: 'SVLN', lang: 'ja', card_number: '001', name: 'マンタイン', canonical_card_id: '245d6c81-0682-43ad-b0c2-8afb0bd3d744' }),
    ]);
    const externalRows = tagExternalCandidates(
      [normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'SVLN-001', set_id: 'SVLN', lang: 'ja', card_number: '001', name: 'マンタイン' })],
      { tcg: 'pokemon', lang: 'ja', setId: 'SVLN' }
    );
    const allRows = [...dbRows, ...externalRows];
    const cascade = runIdentityCascade(allRows);
    const findings = classifyFindingsForReconciliation(cascade, allRows);

    const byType = findings.map((f) => f.finding);
    assert.ok(!byType.includes('CANONICAL_IDENTITY_SPLIT'), `non deve comparire CANONICAL_IDENTITY_SPLIT, trovati: ${JSON.stringify(byType)}`);
    assert.ok(!byType.includes('SOURCE_CONFLICT'), `non deve comparire SOURCE_CONFLICT, trovati: ${JSON.stringify(byType)}`);
    assert.ok(!byType.includes('MISSING') && !byType.includes('EXTRA'), 'una carta matchata non deve apparire come MISSING/EXTRA');

    const dup = findings.find((f) => f.finding === 'EXACT_DUPLICATE');
    assert.ok(dup, `ci si aspetta esattamente un EXACT_DUPLICATE, trovati: ${JSON.stringify(byType)}`);
    assert.equal(dup.row_ids.length, 2);
    assert.ok(dup.row_ids.includes('pokemon:tcgdex:SVLN-001:ja'));
  });

  test('due righe DB con canonical_card_id diversi restano CANONICAL_IDENTITY_SPLIT anche in presenza di un candidato external corretto', () => {
    const dbRows = tagDbRows([
      normalizeDbRow({ id: 'real-A', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '044', name: 'Pikachu', canonical_card_id: 'canon-A' }),
      normalizeDbRow({ id: 'real-B', tcg: 'pokemon', source: 'ptcg', source_id: 'svp-44b', set_id: 'svp', lang: 'en', card_number: '44', name: 'Pikachu', canonical_card_id: 'canon-B' }),
    ]);
    const externalRows = tagExternalCandidates(
      [normalizeDbRow({ tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-44', set_id: 'svp', lang: 'en', card_number: '44', name: 'Pikachu' })],
      { tcg: 'pokemon', lang: 'en', setId: 'svp' }
    );
    const allRows = [...dbRows, ...externalRows];
    const cascade = runIdentityCascade(allRows);
    const findings = classifyFindingsForReconciliation(cascade, allRows);

    const split = findings.find((f) => f.finding === 'CANONICAL_IDENTITY_SPLIT');
    assert.ok(split, 'un\'incoerenza reale fra due righe DB deve continuare a essere rilevata, anche con un external corretto nello stesso cluster');
  });
});

// ============================================================================
// runSetReconciliation — unità di lavoro completa, tutto mockato (nessuna rete reale)
// ============================================================================

describe('runSetReconciliation', () => {
  test('caso completo: 1 carta matchata + 1 solo DB (EXTRA) + 1 solo esterna (MISSING), auditImages disattivato', async () => {
    const { client } = createMockClient({
      responses: [
        { data: [
          { id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', set_name: 'Promo', lang: 'en', card_number: '1', name: 'Matchata', image_url: null, image_url_hi: null },
          { id: 'real-2', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-2', set_id: 'svp', set_name: 'Promo', lang: 'en', card_number: '2', name: 'Solo DB', image_url: null, image_url_hi: null },
        ], error: null },
      ],
    });
    const fetchImpl = mockFetchJson((url) => {
      assert.match(url, /tcgdex\.net\/v2\/en\/sets\/svp/);
      return { name: 'Promo', cards: [
        { localId: '1', name: 'Matchata' },
        { localId: '3', name: 'Solo esterna' },
      ] };
    });

    const report = await runSetReconciliation({ tcg: 'pokemon', lang: 'en', setId: 'svp', client, fetchImpl, auditImages: false });

    assert.equal(report.mode, 'RECONCILE_CATALOG_READ_ONLY');
    assert.equal(report.scope.tcg, 'pokemon');
    assert.equal(report.scope.set_id, 'svp');
    assert.equal(report.db_total, 2);
    assert.equal(report.external_total, 2);
    assert.equal(report.images, null);
    assert.ok(report.findings_summary.EXACT_DUPLICATE >= 1);
    assert.equal(report.findings_summary.MISSING, 1);
    assert.equal(report.findings_summary.EXTRA, 1);
  });

  test('tcg senza fetcher implementato -> SourceNotImplementedError, nessuna query Supabase eseguita', async () => {
    const { client } = createMockClient({ responses: [] });
    await assert.rejects(
      () => runSetReconciliation({ tcg: 'yugioh', lang: 'en', setId: 'x', client, fetchImpl: async () => { throw new Error('non deve essere chiamato'); } }),
      SourceNotImplementedError
    );
  });

  test('onepiece + lang=ja -> propaga OptcgSourceNotImplementedError (mai dati inventati)', async () => {
    const { client } = createMockClient({ responses: [] });
    await assert.rejects(
      () => runSetReconciliation({ tcg: 'onepiece', lang: 'ja', setId: 'OP-01', client, fetchImpl: async () => { throw new Error('non deve essere chiamato'); } }),
      OptcgSourceNotImplementedError
    );
  });

  test('errore Supabase (es. statement timeout) propaga, non viene inghiottito', async () => {
    const { client } = createMockClient({ responses: [{ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }] });
    const fetchImpl = mockFetchJson(() => ({ name: 'X', cards: [] }));
    await assert.rejects(
      () => runSetReconciliation({ tcg: 'pokemon', lang: 'en', setId: 'svp', client, fetchImpl }),
      /SUPABASE_READ_FAILED/
    );
  });

  test('EXTERNAL_SOURCE_FETCHERS copre esattamente pokemon e onepiece (i 2 tcg in scope)', () => {
    assert.deepEqual(Object.keys(EXTERNAL_SOURCE_FETCHERS).sort(), ['onepiece', 'pokemon']);
  });

  test('report.rows espone le righe DB+external taggate (_origin), campo additivo per STEP 5/recovery.mjs', async () => {
    const { client } = createMockClient({
      responses: [{ data: [{ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', name: 'X', image_url: null, image_url_hi: null }], error: null }],
    });
    const fetchImpl = mockFetchJson(() => ({ name: 'X', cards: [{ localId: '1', name: 'X' }] }));
    const report = await runSetReconciliation({ tcg: 'pokemon', lang: 'en', setId: 'svp', client, fetchImpl, auditImages: false });

    assert.ok(Array.isArray(report.rows));
    assert.equal(report.rows.length, 2);
    const db = report.rows.find((r) => r._origin === 'db');
    const ext = report.rows.find((r) => r._origin === 'external');
    assert.equal(db.id, 'real-1');
    assert.equal(ext.id, 'external:pokemon:en:svp:svp-1');
  });

  test('nessuna scrittura Supabase durante un run completo', async () => {
    const { client, writeAttempts } = createMockClient({
      responses: [{ data: [{ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', name: 'X', image_url: null, image_url_hi: null }], error: null }],
    });
    const fetchImpl = mockFetchJson(() => ({ name: 'X', cards: [{ localId: '1', name: 'X' }] }));
    await runSetReconciliation({ tcg: 'pokemon', lang: 'en', setId: 'svp', client, fetchImpl, auditImages: false });
    assert.deepEqual(writeAttempts, { insert: 0, update: 0, upsert: 0, delete: 0 });
  });
});

// ============================================================================
// runReconcileCatalog — loop resumable, checkpoint, NDJSON incrementale
// ============================================================================

describe('runReconcileCatalog', () => {
  let dir;
  test.beforeEach = undefined; // node:test non ha beforeEach a livello di file qui: setup manuale per test

  test('scrive un record NDJSON per set completato e un checkpoint con completedSets', async () => {
    dir = mkdtempSync(join(tmpdir(), 'reconcile-catalog-test-'));
    const outPath = join(dir, 'out.ndjson');
    const checkpointPath = join(dir, 'checkpoint.json');

    const { client } = createMockClient({
      responses: [{ data: [{ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', name: 'X', image_url: null, image_url_hi: null }], error: null }],
    });
    const fetchImpl = mockFetchJson(() => ({ name: 'X', cards: [{ localId: '1', name: 'X' }] }));

    const { completed, skipped, errors } = await runReconcileCatalog({
      targets: [{ tcg: 'pokemon', lang: 'en', setId: 'svp' }],
      client, fetchImpl, outPath, checkpointPath, auditImages: false,
    });

    assert.equal(completed.length, 1);
    assert.equal(skipped.length, 0);
    assert.equal(errors.length, 0);
    assert.ok(existsSync(outPath));
    const lines = readFileSync(outPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.scope.set_id, 'svp');

    const cp = readCheckpoint(checkpointPath);
    assert.deepEqual(cp.completedSets, ['pokemon:en:svp']);

    rmSync(dir, { recursive: true, force: true });
  });

  test('resume: un set già in checkpoint viene saltato, nessuna query/fetch eseguita per esso', async () => {
    dir = mkdtempSync(join(tmpdir(), 'reconcile-catalog-test-'));
    const checkpointPath = join(dir, 'checkpoint.json');
    const { writeFileSync: wf } = await import('node:fs');
    wf(checkpointPath, JSON.stringify({ completedSets: ['pokemon:en:svp'], updatedAt: new Date(0).toISOString() }));

    const { client } = createMockClient({ responses: [] });
    const fetchImpl = async () => { throw new Error('non deve essere chiamato per un set già completato'); };

    const { completed, skipped } = await runReconcileCatalog({
      targets: [{ tcg: 'pokemon', lang: 'en', setId: 'svp' }],
      client, fetchImpl, checkpointPath, auditImages: false,
    });

    assert.equal(completed.length, 0);
    assert.deepEqual(skipped, ['pokemon:en:svp']);

    rmSync(dir, { recursive: true, force: true });
  });

  test('onSetError fornito: un set che fallisce non interrompe gli altri target', async () => {
    const { client } = createMockClient({
      responses: [{ data: [{ id: 'real-1', tcg: 'pokemon', source: 'tcgdex', source_id: 'svp-1', set_id: 'svp', lang: 'en', card_number: '1', name: 'X', image_url: null, image_url_hi: null }], error: null }],
    });
    // Il primo target (onepiece/ja) fallisce PRIMA di qualunque chiamata di
    // rete (OptcgSourceNotImplementedError, lang non supportata) — fetchImpl
    // qui simula solo la risposta reale per il secondo target (pokemon/en).
    const fetchImpl = mockFetchJson(() => ({ name: 'X', cards: [{ localId: '1', name: 'X' }] }));
    const errorsSeen = [];
    const { completed, errors } = await runReconcileCatalog({
      targets: [
        { tcg: 'onepiece', lang: 'ja', setId: 'OP-01' }, // fallisce sempre: lang non implementata
        { tcg: 'pokemon', lang: 'en', setId: 'svp' },
      ],
      client, fetchImpl, auditImages: false,
      onSetError: (err, target) => errorsSeen.push({ target, message: err.message }),
    });

    assert.equal(errors.length, 1);
    assert.equal(errorsSeen.length, 1);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].scope.set_id, 'svp');
  });

  test('senza onSetError, un errore su un target propaga e interrompe il loop', async () => {
    const { client } = createMockClient({ responses: [] });
    await assert.rejects(
      () => runReconcileCatalog({
        targets: [{ tcg: 'onepiece', lang: 'ja', setId: 'OP-01' }],
        client,
        fetchImpl: async () => { throw new Error('non raggiunto'); },
      }),
      OptcgSourceNotImplementedError
    );
  });

  test('targets vuoto -> TypeError', async () => {
    const { client } = createMockClient({ responses: [] });
    await assert.rejects(() => runReconcileCatalog({ targets: [], client }), TypeError);
  });

  test('readCheckpoint su path inesistente -> completedSets vuoto, non un errore', () => {
    const cp = readCheckpoint('/tmp/questo-file-non-esiste-mai-XYZ.json');
    assert.deepEqual(cp.completedSets, []);
  });
});

// ============================================================================
// Garanzia di sola lettura — scansione del sorgente (stesso pattern già in
// uso in supabase-read.js/fetch-tcgdex.js/fetch-optcg.js)
// ============================================================================

describe('garanzia di sola lettura', () => {
  test('reconcile-catalog.mjs non referenzia mai insert/update/upsert/delete', async () => {
    const { readFileSync: rf } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = rf(fileURLToPath(new URL('../reconcile-catalog.mjs', import.meta.url)), 'utf8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const method of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      assert.ok(!stripped.includes(method), `reconcile-catalog.mjs non deve contenere "${method}"`);
    }
  });
});
