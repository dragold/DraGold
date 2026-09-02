#!/usr/bin/env node
// DraGold — Release Monitor (Fase 1)
// Detect: confronta il catalogo upstream (TCGdex per Pokémon, TCGCSV per One
// Piece) col catalogo DraGold, persiste i gap in `catalog_gaps`, calcola e
// registra il KPI di freschezza in `catalog_freshness_runs`.
//
// SOLA LETTURA su `cards`/`canonical_cards`. Scrive SOLO su `catalog_gaps` e
// `catalog_freshness_runs`. Nessuna ingestion qui (quella e' catalog-sync.js).
//
// Uso:
//   node scripts/catalog-freshness.js [--only=onepiece:en[,pokemon:en]] [--dry-run]
//        [--card-diff-days=400] [--max-card-diff-sets=40] [--promo-window-days=180]
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY

import { createClient } from '@supabase/supabase-js';
import { listTcgdexSets, listTcgdexSetCardNumbers } from './lib/catalog/sources/tcgdex-catalog.js';
import { listTcgcsvGroups, listTcgcsvGroupCards, TCGCSV_CATEGORY } from './lib/catalog/sources/tcgcsv-catalog.js';
import { classifyEntityType } from './lib/catalog/classify-entity.js';
import { canonicalOnePieceSetId, normalizeSetCode } from './lib/catalog/normalize-set-code.js';
import { diffSets } from './lib/catalog/reconcile-sets.js';
import { diffSetCards } from './lib/catalog/reconcile-cards.js';
import { cardNumberKey } from './lib/catalog/card-number-key.js';
import { dbSetCodes, dbCardNumbers, dbSetExists, recentlySyncedCounts } from './lib/catalog/db-read.js';
import { upsertGaps, resolveGapsNotIn, gapKey } from './lib/catalog/gaps-store.js';
import { computeFreshnessKpi, kpiToMarkdown } from './lib/catalog/kpi.js';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argVal = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const DRY_RUN = args.includes('--dry-run');
const ONLY = (argVal('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const CARD_DIFF_DAYS = Number(argVal('card-diff-days') || 400);
const MAX_CARD_DIFF_SETS = Number(argVal('max-card-diff-sets') || 40);
const PROMO_WINDOW_DAYS = Number(argVal('promo-window-days') || 180);

const ALL_TARGETS = [
  { tcg: 'pokemon', lang: 'en' },
  { tcg: 'pokemon', lang: 'ja' },
  { tcg: 'onepiece', lang: 'en' },
];
const TARGETS = ONLY.length
  ? ALL_TARGETS.filter((t) => ONLY.includes(`${t.tcg}:${t.lang}`))
  : ALL_TARGETS;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const TODAY = new Date();
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86_400_000);

function withinDays(dateStr, n) {
  if (!dateStr) return true; // data sconosciuta -> trattala come "recente" (da verificare)
  return new Date(dateStr) >= daysAgo(n);
}
function isFuture(dateStr) {
  return dateStr && new Date(dateStr) > TODAY;
}

/** e' un gap che vale la pena inseguire ora (freschezza), non archeologia. */
function isActionableGap(entityType, releaseDate) {
  if (entityType === 'set') return true;
  return isFuture(releaseDate) || withinDays(releaseDate, PROMO_WINDOW_DAYS);
}

// ── Discovery upstream per target ──────────────────────────────────────────────
async function discoverUpstream(target) {
  if (target.tcg === 'pokemon') {
    const sets = await listTcgdexSets(target.lang, { withDetail: true });
    return sets.map((s) => ({
      code: s.code,
      name: s.name,
      releaseDate: s.releaseDate || null,
      cardCountOfficial: s.cardCountOfficial,
      entityType: classifyEntityType({ tcg: 'pokemon', setCode: s.code, groupName: s.name }),
      _fetch: { kind: 'tcgdex', code: s.code, lang: target.lang },
      serieId: s.serieId, serieName: s.serieName, logo: s.logo, symbol: s.symbol,
    }));
  }
  // onepiece -> TCGCSV categoryId 68
  const groups = await listTcgcsvGroups(TCGCSV_CATEGORY.onepiece);
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    const abbr = g.abbreviation || '';
    const baseCode = canonicalOnePieceSetId(abbr || g.name);
    // I gruppi "Release Event Cards" mappano allo stesso token del set base
    // (es. "OP17 RE" -> "OP-17"): serve un code distinto o si sovrascrivono.
    const isRE = /\bRE\b/i.test(abbr) || /release\s*event/i.test(g.name);
    const code = isRE ? `${baseCode}-RE` : baseCode;
    if (seen.has(normalizeSetCode(code))) continue; // primo gruppo vince
    seen.add(normalizeSetCode(code));
    out.push({
      code,
      name: g.name,
      releaseDate: g.publishedOn || null,
      cardCountOfficial: null,
      entityType: isRE ? 'promo' : classifyEntityType({
        tcg: 'onepiece', setCode: code, abbreviation: abbr,
        groupName: g.name, isSupplemental: g.isSupplemental,
      }),
      _fetch: { kind: 'tcgcsv', groupId: g.groupId, category: TCGCSV_CATEGORY.onepiece },
    });
  }
  return out;
}

async function upstreamSetCardKeys(upSet, target) {
  if (upSet._fetch.kind === 'tcgdex') {
    return listTcgdexSetCardNumbers(target.lang, upSet._fetch.code);
  }
  const products = await listTcgcsvGroupCards(upSet._fetch.category, upSet._fetch.groupId);
  const out = new Set();
  for (const p of products) {
    if (!p.number) continue;
    const k = cardNumberKey('onepiece', p.number);
    if (k) out.add(k);
  }
  return out;
}

async function staleSourceNames() {
  const { data } = await sb.from('price_sources')
    .select('id,last_success_at')
    .eq('is_active', true);
  const cutoff = daysAgo(14).getTime();
  return (data || [])
    .filter((r) => !r.last_success_at || new Date(r.last_success_at).getTime() < cutoff)
    .map((r) => r.id);
}

async function run() {
  const perTargetSummaries = [];
  const allDetectedGaps = [];
  let upstreamSetCountTotal = 0;
  let dbSetCountTotal = 0;
  let newSets = 0, newCards = 0, newPromos = 0, resolvedTotal = 0;
  let latestUpstreamRelease = null;
  let latestSyncedRelease = null;

  for (const target of TARGETS) {
    const scopeLabel = `${target.tcg}:${target.lang}`;
    console.error(`\n[freshness] ${scopeLabel} — discovery upstream...`);
    const upstream = await discoverUpstream(target);
    upstreamSetCountTotal += upstream.length;
    for (const s of upstream) {
      if (s.releaseDate && (!latestUpstreamRelease || s.releaseDate > latestUpstreamRelease)) {
        latestUpstreamRelease = s.releaseDate;
      }
    }

    const dbCodes = await dbSetCodes(sb, target.tcg, target.lang);
    dbSetCountTotal += dbCodes.size;

    const { missing, matched } = diffSets({
      upstreamSets: upstream.map((s) => ({ code: s.code, name: s.name, releaseDate: s.releaseDate })),
      dbSetCodesNorm: dbCodes,
    });
    const upByCode = new Map(upstream.map((s) => [normalizeSetCode(s.code), s]));

    const gaps = [];

    // ── set-level gaps ────────────────────────────────────────────────────────
    for (const m of missing) {
      const up = upByCode.get(normalizeSetCode(m.code));
      if (!up) continue;
      if (!isActionableGap(up.entityType, up.releaseDate)) continue;
      // guardia: doppio-check presenza reale (spelling anomalo che il diff
      // normalizzato potrebbe non aver colto).
      if (await dbSetExists(sb, target.tcg, target.lang, up.code)) continue;

      gaps.push({
        tcg: target.tcg, language: target.lang,
        entity_type: up.entityType,
        source: up._fetch.kind, source_id: up.code,
        set_code: up.code, card_number: null,
        name: up.name, release_date: up.releaseDate,
        detail: { fetch: up._fetch, serieId: up.serieId, serieName: up.serieName, cardCountOfficial: up.cardCountOfficial },
      });
    }

    // ── card-level gaps ──────────────────────────────────────────────────────
    // Solo Pokémon (TCGdex): stessa fonte, stessa numerazione del DB -> diff
    // affidabile. Per One Piece il diff per-carta e' rimandato a Fase 1.5:
    // oggi il DB e la fonte (TCGCSV) usano numerazioni non allineate per i set
    // anthology/reprint (EB) e per i parallel/alt-art -> un diff per-numero
    // produrrebbe falsi positivi. La copertura One Piece resta SET-level (un
    // set mancante = tutte le sue carte mancanti, gestito sopra).
    const doCardDiff = target.tcg === 'pokemon';
    const matchedRecent = !doCardDiff ? [] : matched
      .map((s) => upByCode.get(normalizeSetCode(s.code)))
      .filter(Boolean)
      .filter((s) => withinDays(s.releaseDate, CARD_DIFF_DAYS))
      .sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')))
      .slice(0, MAX_CARD_DIFF_SETS);

    for (const s of matched) {
      const up = upByCode.get(normalizeSetCode(s.code));
      if (up?.releaseDate && (!latestSyncedRelease || up.releaseDate > latestSyncedRelease)) {
        latestSyncedRelease = up.releaseDate;
      }
    }

    for (const up of matchedRecent) {
      let upKeys;
      try { upKeys = await upstreamSetCardKeys(up, target); }
      catch (e) { console.error(`  [card-diff] ${up.code}: fetch fallito (${e.message}) — skip`); continue; }
      const dbKeys = await dbCardNumbers(sb, target.tcg, target.lang, up.code);
      const { missingNumbers } = diffSetCards({ setCode: up.code, upstreamNumbers: upKeys, dbNumbers: dbKeys });
      for (const num of missingNumbers) {
        gaps.push({
          tcg: target.tcg, language: target.lang,
          entity_type: 'card',
          source: up._fetch.kind, source_id: `${up.code}#${num}`,
          set_code: up.code, card_number: num,
          name: `${up.name} · ${num}`, release_date: up.releaseDate,
          detail: { fetch: up._fetch },
        });
      }
    }

    // conteggi "nuovi in questo run" = gap che non esistevano prima
    const liveIds = new Set(gaps.map((g) => g.source_id));
    let existingIds = new Set();
    {
      const { data } = await sb.from('catalog_gaps')
        .select('source_id')
        .eq('tcg', target.tcg).eq('language', target.lang);
      existingIds = new Set((data || []).map((r) => r.source_id));
    }
    for (const g of gaps) {
      if (existingIds.has(g.source_id)) continue;
      if (g.entity_type === 'card') newCards++;
      else if (g.entity_type === 'set') newSets++;
      else newPromos++;
    }

    allDetectedGaps.push(...gaps);

    if (!DRY_RUN) {
      const up = await upsertGaps(sb, gaps);
      const res = await resolveGapsNotIn(sb, { tcg: target.tcg, language: target.lang }, liveIds);
      resolvedTotal += res.resolved;
      console.error(`  upsert ${up.upserted} gap, resolved ${res.resolved}`);
    } else {
      console.error(`  [dry-run] ${gaps.length} gap rilevati:`);
      for (const g of gaps.slice(0, 40)) {
        console.error(`    ${g.entity_type.padEnd(6)} ${g.source_id.padEnd(16)} rel=${g.release_date || '?'} ${g.name || ''}`);
      }
    }

    perTargetSummaries.push({ scope: scopeLabel, upstream: upstream.length, dbSets: dbCodes.size, gaps: gaps.length });
  }

  // ── KPI ──────────────────────────────────────────────────────────────────────
  let activeGaps = [];
  if (DRY_RUN) {
    // In dry-run non c'e' stato in DB: il KPI riflette i gap APPENA rilevati.
    activeGaps = allDetectedGaps.map((g) => ({
      entity_type: g.entity_type, status: 'missing',
      release_date: g.release_date, name: g.name, set_code: g.set_code,
    }));
  } else {
    const scopes = TARGETS.map((t) => t.tcg);
    const { data } = await sb.from('catalog_gaps')
      .select('entity_type,status,release_date,name,set_code')
      .in('tcg', [...new Set(scopes)])
      .in('status', ['missing', 'queued', 'error', 'syncing']);
    activeGaps = data || [];
  }
  const failedSyncs = activeGaps.filter((g) => g.status === 'error').length;

  const cards24h = {}, cards7d = {};
  for (const tcg of new Set(TARGETS.map((t) => t.tcg))) {
    const c = await recentlySyncedCounts(sb, tcg);
    cards24h[tcg] = c.last24h; cards7d[tcg] = c.last7d;
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  const kpi = computeFreshnessKpi({
    scope: TARGETS.map((t) => ({ tcg: t.tcg, language: t.lang })),
    upstreamSetCount: upstreamSetCountTotal,
    dbSetCount: dbSetCountTotal,
    activeGaps,
    newThisRun: { sets: newSets, cards: newCards, promos: newPromos },
    resolvedThisRun: resolvedTotal,
    failedSyncs,
    latestUpstreamRelease,
    latestDragoldSyncedRelease: latestSyncedRelease,
    cardsSynced24h: sum(cards24h),
    cardsSynced7d: sum(cards7d),
    staleSources: await staleSourceNames(),
    today: TODAY,
  });

  if (!DRY_RUN) {
    await sb.from('catalog_freshness_runs').insert({
      finished_at: new Date().toISOString(),
      scope: kpi.scope,
      kpi,
      ok: true,
    });
  }

  console.log('CATALOG_FRESHNESS_KPI=' + JSON.stringify(kpi));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, kpiToMarkdown(kpi) + '\n'); } catch { /* noop */ }
  }
  console.error('\n' + kpiToMarkdown(kpi));
  console.error(`\n[freshness] done (${DRY_RUN ? 'DRY-RUN' : 'scritto'}). Targets: ${perTargetSummaries.map((s) => `${s.scope}=${s.gaps}gap`).join(' ')}`);
}

run().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(1);
});
