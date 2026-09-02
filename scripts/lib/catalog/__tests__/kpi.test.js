import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFreshnessKpi, kpiToMarkdown } from '../kpi.js';

const TODAY = new Date('2026-09-02T00:00:00Z');

test('computeFreshnessKpi: released-but-missing vs upcoming', () => {
  const kpi = computeFreshnessKpi({
    scope: [{ tcg: 'onepiece', language: 'en' }],
    upstreamSetCount: 22, dbSetCount: 21,
    activeGaps: [
      { entity_type: 'set', status: 'missing', release_date: '2026-08-28', name: 'OP-17', set_code: 'OP-17' }, // released
      { entity_type: 'set', status: 'missing', release_date: '2026-11-20', name: 'OP-18' },                     // upcoming
      { entity_type: 'card', status: 'missing', release_date: '2026-08-28' },
      { entity_type: 'card', status: 'resolved', release_date: '2026-08-28' },                                  // non conta
    ],
    newThisRun: { sets: 1, cards: 3, promos: 0 },
    resolvedThisRun: 2,
    failedSyncs: 0,
    latestUpstreamRelease: '2026-11-20',
    latestDragoldSyncedRelease: '2026-06-12',
    cardsSynced24h: 0, cardsSynced7d: 0,
    staleSources: ['pokemontcgio'],
    today: TODAY,
  });
  assert.equal(kpi.released_but_missing_sets, 1);
  assert.equal(kpi.released_but_missing_promos, 0);
  assert.equal(kpi.released_but_missing_cards, 1);
  assert.equal(kpi.upcoming_sets, 1);
  assert.equal(kpi.resolved_gaps, 2);
  assert.equal(kpi.ingestion_delay_days, 5); // 2026-08-28 -> 2026-09-02
  assert.equal(kpi.new_cards, 3);
  assert.deepEqual(kpi.stale_sources, ['pokemontcgio']);
  assert.equal(kpi.released_but_missing_detail[0].set_code, 'OP-17');
});

test('computeFreshnessKpi: nessun gap -> zero delay', () => {
  const kpi = computeFreshnessKpi({
    scope: [], upstreamSetCount: 10, dbSetCount: 10, activeGaps: [],
    newThisRun: { sets: 0, cards: 0, promos: 0 }, resolvedThisRun: 0, failedSyncs: 0,
    cardsSynced24h: 5, cardsSynced7d: 40, staleSources: [], today: TODAY,
  });
  assert.equal(kpi.released_but_missing_sets, 0);
  assert.equal(kpi.ingestion_delay_days, 0);
  assert.equal(kpi.cards_synced_7d, 40);
});

test('kpiToMarkdown: contiene la riga released-but-missing', () => {
  const md = kpiToMarkdown(computeFreshnessKpi({
    scope: [], upstreamSetCount: 1, dbSetCount: 0,
    activeGaps: [{ entity_type: 'set', status: 'missing', release_date: '2026-08-28', name: 'OP-17', set_code: 'OP-17' }],
    newThisRun: { sets: 1, cards: 0, promos: 0 }, resolvedThisRun: 0, failedSyncs: 0,
    cardsSynced24h: 0, cardsSynced7d: 0, staleSources: [], today: TODAY,
  }));
  assert.match(md, /Released but missing — SETS/);
  assert.match(md, /OP-17/);
});
