import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMissingCardCandidates,
  buildImageRecoveryCandidate,
  findMatchedExternalRow,
  buildRecoveryReport,
  RECOVERY_CANDIDATE_KIND,
} from '../recovery.mjs';
import { IMAGE_STATUS, RECOVERY_STATUS } from '../image-taxonomy.js';

function mockFetchImage(statusOk = true) {
  return async () => ({
    ok: statusOk,
    status: statusOk ? 200 : 404,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' && statusOk ? 'image/webp' : null) },
    arrayBuffer: async () => new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer, // RIFF (webp magic-ish, non verificato a fondo qui)
  });
}

// ============================================================================
// buildMissingCardCandidates
// ============================================================================

describe('buildMissingCardCandidates', () => {
  test('costruisce un candidato per ogni finding MISSING, confidence invariata dal finding', async () => {
    const findings = [
      {
        finding: 'MISSING', subtype: 'PRESENT_IN_EXTERNAL_SOURCE_NOT_IN_DB', confidence: 'MEDIUM',
        row_ids: ['external:pokemon:ja:SVLN:SVLN-099'],
        evidence: { row: { source: 'tcgdex:external', source_id: 'SVLN-099', set_id: 'SVLN', card_number: '099', name: 'Carta Nuova', image_url: null, image_url_hi: null } },
      },
      { finding: 'EXACT_DUPLICATE', row_ids: ['a', 'b'] }, // deve essere ignorato
    ];
    const candidates = await buildMissingCardCandidates(findings, { verifyImages: false });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].kind, RECOVERY_CANDIDATE_KIND.MISSING_CARD);
    assert.equal(candidates[0].source_id, 'SVLN-099');
    assert.equal(candidates[0].confidence, 'MEDIUM');
    assert.equal(candidates[0].provenance.mechanism, 'RECONCILE_FINDING_MISSING');
    assert.equal(candidates[0].image_verification, null, 'verifyImages=false non deve fare rete');
  });

  test('con verifyImages=true, verifica image_url via auditCardImages (HTTP mockato, mai reale)', async () => {
    const findings = [{
      finding: 'MISSING', subtype: 'X', confidence: 'MEDIUM', row_ids: ['ext-1'],
      evidence: { row: { source: 'tcgdex:external', source_id: 'SVLN-099', set_id: 'SVLN', card_number: '099', name: 'X', image_url: 'https://x/1.webp', image_url_hi: 'https://x/1-hi.webp' } },
    }];
    const candidates = await buildMissingCardCandidates(findings, { fetchImpl: mockFetchImage(true) });
    assert.ok(candidates[0].image_verification);
    assert.equal(candidates[0].image_verification.image_url.status, IMAGE_STATUS.OK);
  });

  test('finding MISSING senza evidence.row -> saltato, mai un candidato con dati inventati', async () => {
    const findings = [{ finding: 'MISSING', subtype: 'X', confidence: 'MEDIUM', row_ids: ['x'], evidence: {} }];
    const candidates = await buildMissingCardCandidates(findings, { verifyImages: false });
    assert.deepEqual(candidates, []);
  });

  test('nessun finding MISSING -> array vuoto', async () => {
    const candidates = await buildMissingCardCandidates([], { verifyImages: false });
    assert.deepEqual(candidates, []);
  });
});

// ============================================================================
// findMatchedExternalRow
// ============================================================================

describe('findMatchedExternalRow', () => {
  test('trova la riga external in un cluster EXACT_DUPLICATE a 2 righe', () => {
    const findings = [{ finding: 'EXACT_DUPLICATE', row_ids: ['db-1', 'ext-1'] }];
    const rowsById = new Map([
      ['db-1', { id: 'db-1', _origin: 'db' }],
      ['ext-1', { id: 'ext-1', _origin: 'external', image_url: 'https://x/1.webp' }],
    ]);
    const { row, finding, reason } = findMatchedExternalRow('db-1', findings, rowsById);
    assert.equal(reason, 'OK');
    assert.equal(row.id, 'ext-1');
    assert.equal(finding.finding, 'EXACT_DUPLICATE');
  });

  test('nessun finding EXACT_DUPLICATE per questa carta -> NO_MATCH_FINDING, row null', () => {
    const { row, reason } = findMatchedExternalRow('db-1', [], new Map());
    assert.equal(row, null);
    assert.equal(reason, 'NO_MATCH_FINDING');
  });

  test('più di un cluster EXACT_DUPLICATE per la stessa carta -> AMBIGUOUS, mai una scelta arbitraria', () => {
    const findings = [
      { finding: 'EXACT_DUPLICATE', row_ids: ['db-1', 'ext-1'] },
      { finding: 'EXACT_DUPLICATE', row_ids: ['db-1', 'ext-2'] },
    ];
    const rowsById = new Map([
      ['db-1', { id: 'db-1', _origin: 'db' }],
      ['ext-1', { id: 'ext-1', _origin: 'external' }],
      ['ext-2', { id: 'ext-2', _origin: 'external' }],
    ]);
    const { row, reason } = findMatchedExternalRow('db-1', findings, rowsById);
    assert.equal(row, null);
    assert.equal(reason, 'AMBIGUOUS_MULTIPLE_CLUSTERS');
  });

  test('cluster senza righe _origin=external (es. due righe DB) -> NO_EXTERNAL_ROW_IN_CLUSTER', () => {
    const findings = [{ finding: 'EXACT_DUPLICATE', row_ids: ['db-1', 'db-2'] }];
    const rowsById = new Map([
      ['db-1', { id: 'db-1', _origin: 'db' }],
      ['db-2', { id: 'db-2', _origin: 'db' }],
    ]);
    const { row, reason } = findMatchedExternalRow('db-1', findings, rowsById);
    assert.equal(row, null);
    assert.equal(reason, 'NO_EXTERNAL_ROW_IN_CLUSTER');
  });
});

// ============================================================================
// buildImageRecoveryCandidate — cascata a 2 stadi
// ============================================================================

describe('buildImageRecoveryCandidate', () => {
  test('stadio 1: riga esterna già matchata con immagine verificabile -> RECOVERABLE_TCGDEX, confidence HIGH, nessuna chiamata a resolveCardImpl', async () => {
    const dbCard = { id: 'db-1', tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', card_number_raw: '001', name: 'マンタイン', image_url: null, image_url_hi: null };
    const matchedExternalRow = { source: 'tcgdex:external', source_id: 'SVLN-001', image_url: 'https://x/low.webp', image_url_hi: 'https://x/high.webp' };
    let resolveCardCalls = 0;
    const resolveCardImpl = async () => { resolveCardCalls++; return { resolved: false, attempts: [] }; };

    const candidate = await buildImageRecoveryCandidate(dbCard, {
      matchedExternalRow, matchFinding: { subtype: 'CROSS_SOURCE_SOURCE_ID_MATCH' },
      fetchImpl: mockFetchImage(true), resolveCardImpl,
    });

    assert.equal(candidate.status, RECOVERY_STATUS.RECOVERABLE_TCGDEX);
    assert.equal(candidate.candidate_url, 'https://x/high.webp');
    assert.equal(candidate.confidence, 'HIGH');
    assert.equal(candidate.provenance.mechanism, 'RECONCILE_MATCHED_EXTERNAL_CANDIDATE');
    assert.equal(resolveCardCalls, 0, 'stadio 2 non deve essere invocato se stadio 1 ha già prodotto un candidato verificato');
  });

  test('stadio 1 fallisce (immagine esterna anch\'essa rotta) -> passa a stadio 2 (pokemon)', async () => {
    const dbCard = { id: 'db-1', tcg: 'pokemon', lang: 'en', set_id: 'svp', card_number_raw: '1', name: 'X', image_url: null, image_url_hi: null };
    const matchedExternalRow = { source: 'tcgdex:external', source_id: 'svp-1', image_url_hi: 'https://x/rotta.webp' };
    const resolveCardImpl = async () => ({ resolved: true, source: 'tcgdex_retry', url: 'https://x/recuperata.webp', match_confidence: 'MEDIUM', match_reason: 'stessa fonte primaria', attempts: [] });

    const candidate = await buildImageRecoveryCandidate(dbCard, {
      matchedExternalRow, fetchImpl: mockFetchImage(false), resolveCardImpl,
    });

    assert.equal(candidate.status, RECOVERY_STATUS.RECOVERABLE_TCGDEX);
    assert.equal(candidate.candidate_url, 'https://x/recuperata.webp');
    assert.equal(candidate.provenance.mechanism, 'RESOLVE_FALLBACK_CASCADE');
  });

  test('tcg=onepiece -> UNRESOLVED esplicito, resolveCardImpl mai invocato (nessun resolver dichiarato)', async () => {
    const dbCard = { id: 'db-1', tcg: 'onepiece', lang: 'en', set_id: 'OP-01', card_number_raw: 'OP01-1', name: 'X', image_url: null, image_url_hi: null };
    let calls = 0;
    const resolveCardImpl = async () => { calls++; return { resolved: false }; };
    const candidate = await buildImageRecoveryCandidate(dbCard, { fetchImpl: mockFetchImage(true), resolveCardImpl });
    assert.equal(candidate.status, RECOVERY_STATUS.UNRESOLVED);
    assert.equal(candidate.provenance.mechanism, 'NO_RESOLVER_FOR_TCG');
    assert.equal(calls, 0);
  });

  test('resolveCard restituisce match_confidence LOW -> AMBIGUOUS, MAI auto-risolto', async () => {
    const dbCard = { id: 'db-1', tcg: 'pokemon', lang: 'en', set_id: 'svp', card_number_raw: '1', name: 'X' };
    const resolveCardImpl = async () => ({ resolved: true, source: 'scrydex', url: 'https://x/forse.webp', match_confidence: 'LOW', match_reason: 'numero e lingua coerenti ma nome diverso', attempts: [] });
    const candidate = await buildImageRecoveryCandidate(dbCard, { fetchImpl: mockFetchImage(true), resolveCardImpl });
    assert.equal(candidate.status, RECOVERY_STATUS.AMBIGUOUS);
    assert.equal(candidate.candidate_url, 'https://x/forse.webp', 'il candidato resta visibile per revisione manuale, solo lo status è AMBIGUOUS');
    assert.match(candidate.provenance.note, /MAI auto-risolto/);
  });

  test('resolveCard non trova nulla -> UNRESOLVED, attempts riportati per trasparenza', async () => {
    const dbCard = { id: 'db-1', tcg: 'pokemon', lang: 'en', set_id: 'svp', card_number_raw: '1', name: 'X' };
    const resolveCardImpl = async () => ({ resolved: false, attempts: [{ stage: 'tryTcgdexRetry', result: null }, { stage: 'tryScrydex', result: { skipped: true } }] });
    const candidate = await buildImageRecoveryCandidate(dbCard, { fetchImpl: mockFetchImage(true), resolveCardImpl });
    assert.equal(candidate.status, RECOVERY_STATUS.UNRESOLVED);
    assert.equal(candidate.candidate_url, null);
    assert.deepEqual(candidate.provenance.attempts, ['tryTcgdexRetry', 'tryScrydex']);
  });

  test('nessuna riga esterna matchata (matchedExternalRow=null) -> passa direttamente a stadio 2', async () => {
    const dbCard = { id: 'db-1', tcg: 'pokemon', lang: 'en', set_id: 'svp', card_number_raw: '1', name: 'X' };
    const resolveCardImpl = async () => ({ resolved: true, source: 'pokemontcg.io', url: 'https://x/y.webp', match_confidence: 'HIGH', match_reason: 'exact', attempts: [] });
    const candidate = await buildImageRecoveryCandidate(dbCard, { matchedExternalRow: null, fetchImpl: mockFetchImage(true), resolveCardImpl });
    assert.equal(candidate.status, RECOVERY_STATUS.RECOVERABLE_OTHER);
    assert.equal(candidate.candidate_source, 'pokemontcg.io');
  });
});

// ============================================================================
// buildRecoveryReport — orchestratore completo
// ============================================================================

describe('buildRecoveryReport', () => {
  test('separa correttamente missing_card_candidates e image_recovery_candidates, con summary', async () => {
    const report = {
      scope: { tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', set_name: 'Test' },
      findings: [
        {
          finding: 'MISSING', subtype: 'X', confidence: 'MEDIUM', row_ids: ['ext-99'],
          evidence: { row: { source: 'tcgdex:external', source_id: 'SVLN-099', set_id: 'SVLN', card_number: '099', name: 'Nuova', image_url: null, image_url_hi: null } },
        },
        { finding: 'EXACT_DUPLICATE', subtype: 'CROSS_SOURCE_SOURCE_ID_MATCH', row_ids: ['db-broken', 'ext-broken'] },
      ],
      rows: [
        { id: 'db-broken', _origin: 'db', tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', name: 'Rotta', image_url: null, image_url_hi: null },
        { id: 'ext-broken', _origin: 'external', source: 'tcgdex:external', source_id: 'SVLN-002', image_url: 'https://x/recuperabile.webp', image_url_hi: 'https://x/recuperabile-hi.webp' },
      ],
      images: {
        tally: {}, cards: [
          { id: 'db-broken', source_id: 'SVLN-002', image_status: IMAGE_STATUS.BROKEN },
          { id: 'db-ok', source_id: 'SVLN-003', image_status: IMAGE_STATUS.OK }, // deve essere ignorata (non recoverable status)
        ],
      },
    };

    const recovery = await buildRecoveryReport(report, { fetchImpl: mockFetchImage(true), verifyMissingCardImages: false });

    assert.equal(recovery.mode, 'RECOVERY_DRY_RUN_READ_ONLY');
    assert.equal(recovery.missing_card_candidates.length, 1);
    assert.equal(recovery.missing_card_candidates[0].source_id, 'SVLN-099');
    assert.equal(recovery.image_recovery_candidates.length, 1);
    assert.equal(recovery.image_recovery_candidates[0].card_id, 'db-broken');
    assert.equal(recovery.image_recovery_candidates[0].status, RECOVERY_STATUS.RECOVERABLE_TCGDEX);
    assert.equal(recovery.summary.missing_cards, 1);
    assert.equal(recovery.summary.image_recovery[RECOVERY_STATUS.RECOVERABLE_TCGDEX], 1);
  });

  test('IMAGE_FETCH_ERROR escluso di proposito dal recupero (stato transient, non prova che sia rotta)', async () => {
    const report = {
      scope: { tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', set_name: 'Test' },
      findings: [],
      rows: [{ id: 'db-1', _origin: 'db', tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', name: 'X' }],
      images: { tally: {}, cards: [{ id: 'db-1', source_id: 'SVLN-1', image_status: IMAGE_STATUS.FETCH_ERROR }] },
    };
    const recovery = await buildRecoveryReport(report, { fetchImpl: mockFetchImage(true) });
    assert.equal(recovery.image_recovery_candidates.length, 0);
  });

  test('report senza .rows -> TypeError esplicito (contratto richiesto, mai un fallback silenzioso)', async () => {
    await assert.rejects(() => buildRecoveryReport({ findings: [] }), /report\.rows mancante/);
  });

  test('report senza .findings -> TypeError esplicito', async () => {
    await assert.rejects(() => buildRecoveryReport({ rows: [] }), TypeError);
  });

  test('senza images (auditImages=false a monte) -> image_recovery_candidates vuoto, missing_card_candidates comunque calcolato', async () => {
    const report = {
      scope: { tcg: 'pokemon', lang: 'ja', set_id: 'SVLN', set_name: 'Test' },
      findings: [{
        finding: 'MISSING', subtype: 'X', confidence: 'MEDIUM', row_ids: ['ext-1'],
        evidence: { row: { source: 'tcgdex:external', source_id: 'SVLN-1', set_id: 'SVLN', card_number: '1', name: 'X', image_url: null, image_url_hi: null } },
      }],
      rows: [],
      images: null,
    };
    const recovery = await buildRecoveryReport(report, { verifyMissingCardImages: false });
    assert.equal(recovery.missing_card_candidates.length, 1);
    assert.deepEqual(recovery.image_recovery_candidates, []);
  });
});

// ============================================================================
// Garanzie di sola lettura / nessun download reale
// ============================================================================

describe('garanzia di sola lettura e nessuna scrittura', () => {
  test('recovery.mjs non referenzia mai insert/update/upsert/delete', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(fileURLToPath(new URL('../recovery.mjs', import.meta.url)), 'utf8');
    const stripped = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const method of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      assert.ok(!stripped.includes(method), `recovery.mjs non deve contenere "${method}"`);
    }
  });
});
