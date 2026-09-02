// DraGold — Catalog Freshness (Fase 1)
// Calcolo del KPI di freschezza catalogo. Puro (nessun I/O).
// Lista campi: docs/plans/2026-09-02-dragold-vnext-audit-and-roadmap.md §8.

function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

const SET_LIKE = new Set(['set', 'promo', 'special']);
const OPEN_STATUS = new Set(['missing', 'queued', 'error', 'syncing']);

/**
 * @param {object} input
 * @param {{tcg:string,language:string}[]} input.scope
 * @param {number} input.upstreamSetCount
 * @param {number} input.dbSetCount
 * @param {Array<{entity_type:string,status:string,release_date:string|null}>} input.activeGaps
 *        - i gap ancora "aperti" (non resolved/ignored) dopo questo run
 * @param {{sets:number,cards:number,promos:number}} input.newThisRun
 * @param {number} input.resolvedThisRun
 * @param {number} input.failedSyncs - gap con status 'error'
 * @param {string|null} input.latestUpstreamRelease   - ISO date
 * @param {string|null} input.latestDragoldSyncedRelease - ISO date
 * @param {number} input.cardsSynced24h
 * @param {number} input.cardsSynced7d
 * @param {string[]} input.staleSources
 * @param {Date} [input.today]
 * @returns {object}
 */
export function computeFreshnessKpi(input) {
  const today = input.today || new Date();
  const gaps = Array.isArray(input.activeGaps) ? input.activeGaps : [];

  const isReleased = (g) => g.release_date && new Date(g.release_date) <= today;
  const isUpcoming = (g) => g.release_date && new Date(g.release_date) > today;

  const releasedMissingSets = gaps.filter(
    (g) => g.entity_type === 'set' && OPEN_STATUS.has(g.status) && isReleased(g),
  );
  const releasedMissingPromos = gaps.filter(
    (g) => (g.entity_type === 'promo' || g.entity_type === 'special') && OPEN_STATUS.has(g.status) && isReleased(g),
  );
  const releasedMissingCards = gaps.filter(
    (g) => g.entity_type === 'card' && OPEN_STATUS.has(g.status) && (isReleased(g) || !g.release_date),
  );
  const upcomingSets = gaps.filter(
    (g) => SET_LIKE.has(g.entity_type) && OPEN_STATUS.has(g.status) && isUpcoming(g),
  );

  // ritardo di ingestion = solo sulle espansioni numerate mancanti (non sui
  // promo/release-event, il cui "ritardo" e' meno significativo).
  let ingestionDelayDays = 0;
  for (const g of releasedMissingSets) {
    const d = daysBetween(today, new Date(g.release_date));
    if (d > ingestionDelayDays) ingestionDelayDays = d;
  }

  return {
    generated_at: today.toISOString(),
    scope: input.scope || [],
    source_catalog_sets: input.upstreamSetCount ?? null,
    dragold_catalog_sets: input.dbSetCount ?? null,
    new_sets: input.newThisRun?.sets ?? 0,
    new_cards: input.newThisRun?.cards ?? 0,
    new_promos: input.newThisRun?.promos ?? 0,
    released_but_missing_sets: releasedMissingSets.length,
    released_but_missing_promos: releasedMissingPromos.length,
    released_but_missing_cards: releasedMissingCards.length,
    upcoming_sets: upcomingSets.length,
    resolved_gaps: input.resolvedThisRun ?? 0,
    failed_syncs: input.failedSyncs ?? 0,
    ingestion_delay_days: ingestionDelayDays,
    latest_upstream_release: input.latestUpstreamRelease ?? null,
    latest_dragold_synced_release: input.latestDragoldSyncedRelease ?? null,
    cards_synced_24h: input.cardsSynced24h ?? 0,
    cards_synced_7d: input.cardsSynced7d ?? 0,
    stale_sources: input.staleSources || [],
    released_but_missing_detail: [...releasedMissingSets, ...releasedMissingPromos]
      .sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)))
      .slice(0, 25).map((g) => ({
        entity_type: g.entity_type, name: g.name ?? null, set_code: g.set_code ?? null,
        release_date: g.release_date, delay_days: daysBetween(today, new Date(g.release_date)),
      })),
  };
}

/** Rende il KPI come tabella markdown per $GITHUB_STEP_SUMMARY. */
export function kpiToMarkdown(kpi) {
  const rows = [
    ['Source catalog sets', kpi.source_catalog_sets],
    ['DraGold catalog sets', kpi.dragold_catalog_sets],
    ['New sets (this run)', kpi.new_sets],
    ['New cards (this run)', kpi.new_cards],
    ['New promos (this run)', kpi.new_promos],
    ['**Released but missing — SETS**', `**${kpi.released_but_missing_sets}**`],
    ['Released but missing — promos/special', kpi.released_but_missing_promos],
    ['**Released but missing — CARDS**', `**${kpi.released_but_missing_cards}**`],
    ['Upcoming sets', kpi.upcoming_sets],
    ['Resolved gaps (this run)', kpi.resolved_gaps],
    ['Failed syncs', kpi.failed_syncs],
    ['Max ingestion delay (days)', kpi.ingestion_delay_days],
    ['Latest upstream release', kpi.latest_upstream_release],
    ['Latest DraGold synced release', kpi.latest_dragold_synced_release],
    ['Cards synced 24h', kpi.cards_synced_24h],
    ['Cards synced 7d', kpi.cards_synced_7d],
    ['Stale sources', (kpi.stale_sources || []).join(', ') || '—'],
  ];
  let md = `### Catalog Freshness KPI\n\n| Metric | Value |\n|---|---|\n`;
  for (const [k, v] of rows) md += `| ${k} | ${v ?? '—'} |\n`;
  if (kpi.released_but_missing_detail?.length) {
    md += `\n#### Released but missing (top ${kpi.released_but_missing_detail.length})\n\n| Entity | Name | Code | Released | Delay (d) |\n|---|---|---|---|---|\n`;
    for (const d of kpi.released_but_missing_detail) {
      md += `| ${d.entity_type} | ${d.name ?? '—'} | ${d.set_code ?? '—'} | ${d.release_date} | ${d.delay_days} |\n`;
    }
  }
  return md;
}
