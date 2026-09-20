#!/usr/bin/env node
/**
 * DraGold — One-shot: ri-punta le immagini One Piece dai thumbnail TCGplayer
 * ("SAMPLE": 200px, watermark, e da fine agosto 2026 anche 403 hotlink) all'arte
 * ufficiale Bandai, con matching DETERMINISTICO sul numero carta.
 *
 * ─── Contesto ───────────────────────────────────────────────────────────────
 * La sync catalogo One Piece via TCGCSV assegna a 479 carte EN (set recenti
 * OP-17, release-event *-RE, starter ST-31..36) l'imageUrl del prodotto
 * TCGplayer `tcgplayer-cdn.tcgplayer.com/product/<id>_200w.jpg`. L'audit del
 * run GH 33683081131 le classifica per l'84% ancora "valide" (HTTP 200 in
 * browser) ma sono comunque thumbnail 200px, e 84 sono già 403.
 *
 * ─── Regola di risoluzione (approvata, ordine di priorità) ──────────────────
 *   1. TWIN   — esiste già in DB un'altra carta One Piece con STESSO lang+numero
 *               che usa l'URL base ufficiale `<card_number>.png`. Copiamo quella
 *               URL, già verificata e in produzione.                   [HIGH]
 *   2. BASE   — nessun twin, carta base (non -RE, non variante): candidato
 *               deterministico `<card_number>.png` su onepiece-cardgame.com,
 *               accettato SOLO dopo probe HTTP reale (200/206 + image/*). [HIGH]
 *   3. RE     — set_id `*-RE` senza twin: stesso candidato deterministico, ma
 *               NON applicato senza --include-re (gate di verifica visiva
 *               manuale sul campione, vedi PR). Senza il flag → `re_pending_review`.
 *   4. AMBIGUA (ALT-ART / (SP) / manga / parallel / box topper): NON toccata.
 *               Bandai per numero ha solo l'arte base: per una variante sarebbe
 *               l'immagine sbagliata. `accuracy > coverage`.
 *   5. BUNDLE (pack / "[Set of 6]" / tournament pack): non è una carta, escluso.
 *   6. Senza card_number (DON!! alt-art): non risolvibile per numero, escluso.
 *
 * Mai matching visuale/speculativo. Mai un URL "indovinato" senza probe.
 * Mai `_p1/_p2` per tentare una variante.
 *
 * ─── Sicurezza / scope ─────────────────────────────────────────────────────
 *  - dry-run di default; scrive solo con --apply.
 *  - scrive SOLO `image_url` + `image_url_hi` (coerenti, stesso URL), SOLO su
 *    righe HIGH-confidence. Nessuna scrittura se il candidato non passa il probe.
 *  - non tocca: schema, valuation, portfolio, search, catalog pipeline, matching
 *    carte, altre lingue, Pokémon, card_image_cache.
 *  - idempotente: una riga già puntata all'ufficiale → `already_official` (no-op).
 *
 * ─── Uso ───────────────────────────────────────────────────────────────────
 *   node scripts/fix-onepiece-image-source.mjs                    # dry-run
 *   node scripts/fix-onepiece-image-source.mjs --include-re       # dry-run, include RE
 *   node scripts/fix-onepiece-image-source.mjs --apply            # scrive (no RE)
 *   node scripts/fix-onepiece-image-source.mjs --apply --include-re
 *   node scripts/fix-onepiece-image-source.mjs --json=out.json --audit-crawl=path/crawl-onepiece.ndjson
 * Env: SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { validateImageUrl } from './sources/pokemon-jp/validate-image.mjs';

const BANDAI_EN = 'https://en.onepiece-cardgame.com';
const BANDAI_JA = 'https://www.onepiece-cardgame.com';
const CARDLIST_PATH = (n) => `/images/cardlist/card/${n}.png`;

// Nome che segnala una VARIANTE d'arte (non l'arte base per quel numero).
// Tenuto stretto a ciò che compare davvero nel dataset target — vedi audit.
export const AMBIGUOUS_NAME_RE = /\(sp\)|alt(?:ernate)?\.?\s*art|\bmanga\b|special\s+foil|\bparallel\b|box\s*topper/i;
// Nome che segnala un PRODOTTO, non una singola carta.
export const BUNDLE_NAME_RE = /\bset of\b|\[set of|release event pack|tournament pack|deck set|\bbundle\b/i;
// print_variant che indica una variante (qualsiasi valore non-base non vuoto, in pratica).
const BASE_PRINT_VARIANTS = new Set(['', 'base', 'normal', 'standard']);

/** URL immagine base Bandai per una carta. Puro. */
export function bandaiImageUrl(cardNumber, lang) {
  const n = String(cardNumber ?? '').trim();
  if (!n) return null;
  const base = lang === 'ja' ? BANDAI_JA : BANDAI_EN;
  return `${base}${CARDLIST_PATH(n)}`;
}

export function hasCardNumber(card) {
  return Boolean(String(card?.card_number ?? '').trim());
}

export function isReleaseEventSet(setId) {
  return /-RE$/.test(String(setId ?? ''));
}

export function isBundle(card) {
  return BUNDLE_NAME_RE.test(String(card?.name ?? ''));
}

/** Variante d'arte → da NON risolvere con l'arte base per numero. Puro. */
export function isAmbiguousVariant(card) {
  const pv = String(card?.print_variant ?? '').trim().toLowerCase();
  if (pv && !BASE_PRINT_VARIANTS.has(pv)) return true;
  return AMBIGUOUS_NAME_RE.test(String(card?.name ?? ''));
}

/**
 * Costruisce l'indice degli URL ufficiali già in uso, per numero+lingua.
 * key = `${lang}|${card_number}` -> Set<image_url>. Puro.
 */
export function buildOfficialIndex(officialRows) {
  const idx = new Map();
  for (const r of officialRows || []) {
    if (!r || !r.card_number || !r.image_url) continue;
    const key = `${r.lang}|${String(r.card_number).trim()}`;
    if (!idx.has(key)) idx.set(key, new Set());
    idx.get(key).add(r.image_url);
  }
  return idx;
}

/**
 * Un "twin" esiste solo se un'altra carta usa esattamente l'URL BASE
 * `<card_number>.png` (host EN o JA). URL ufficiali che esistono solo come
 * `_p1`/`_p2` NON contano come twin: quel numero ha solo varianti pubblicate,
 * non l'arte base — va trattato come BASE/RE e verificato col probe. Puro.
 */
export function findTwinUrl(card, officialIndex) {
  const num = String(card?.card_number ?? '').trim();
  if (!num) return null;
  const key = `${card.lang}|${num}`;
  const urls = officialIndex.get(key);
  if (!urls) return null;
  const wantPath = CARDLIST_PATH(num);
  const candidate = bandaiImageUrl(num, card.lang);
  for (const u of urls) {
    if (u === candidate) return u;
    try { if (new URL(u).pathname === wantPath) return u; } catch { /* URL malformato: ignora */ }
  }
  return null;
}

/**
 * Classificazione PURA di una carta target (nessuna I/O). Il probe HTTP e la
 * scrittura sono responsabilità dell'orchestratore.
 *
 * @returns {{disposition: string, tier: 'twin'|'base'|'re'|null, candidate: string|null, twinUrl: string|null}}
 *   disposition ∈ already_official | no_card_number | bundle | ambiguous_variant
 *               | re_pending_review | resolvable
 */
export function classifyCard(card, { officialIndex = new Map(), includeRE = false } = {}) {
  const candidate = bandaiImageUrl(card?.card_number, card?.lang);

  if (candidate && card?.image_url === candidate && card?.image_url_hi === candidate) {
    return { disposition: 'already_official', tier: null, candidate, twinUrl: null };
  }
  if (!hasCardNumber(card)) {
    return { disposition: isBundle(card) ? 'bundle' : 'no_card_number', tier: null, candidate: null, twinUrl: null };
  }
  if (isBundle(card)) {
    return { disposition: 'bundle', tier: null, candidate: null, twinUrl: null };
  }
  if (isAmbiguousVariant(card)) {
    return { disposition: 'ambiguous_variant', tier: null, candidate, twinUrl: null };
  }

  const twinUrl = findTwinUrl(card, officialIndex);
  const tier = twinUrl ? 'twin' : (isReleaseEventSet(card?.set_id) ? 're' : 'base');

  if (tier === 're' && !includeRE) {
    return { disposition: 're_pending_review', tier, candidate, twinUrl: null };
  }
  return { disposition: 'resolvable', tier, candidate, twinUrl };
}

/**
 * Dato l'esito del probe (da validateImageUrl), decide l'esito finale di una
 * carta `resolvable`. Puro.
 * @returns {{action: 'apply'|'skip', reason: string|null}}
 */
export function verdictFromProbe(probe) {
  if (probe?.usable === true) return { action: 'apply', reason: null };
  if (probe?.reason === 'not_found') return { action: 'skip', reason: 'bandai_404' };
  if (probe?.reason === 'blocked') return { action: 'skip', reason: 'bandai_blocked' };
  if (probe?.reason === 'not_an_image') return { action: 'skip', reason: 'bandai_not_an_image' };
  if (probe?.reason === 'transient') return { action: 'skip', reason: 'bandai_transient' };
  return { action: 'skip', reason: `bandai_${probe?.reason || 'unknown'}` };
}

/**
 * Riduce le righe crawl (una per card_id+field) a uno stato per carta.
 * classification A/B → VALID, C/E → BROKEN, D o assente → MISSING. Il peggiore vince.
 * Puro.
 * @returns {Map<string, 'VALID'|'BROKEN'|'MISSING'>}
 */
export function crawlStateByCard(crawlRows) {
  const rank = { VALID: 0, BROKEN: 1, MISSING: 2 };
  const of = (c) => (c === 'A' || c === 'B' ? 'VALID' : c === 'C' || c === 'E' ? 'BROKEN' : 'MISSING');
  const m = new Map();
  for (const r of crawlRows || []) {
    if (!r || !r.card_id) continue;
    const s = of(r.classification);
    const prev = m.get(r.card_id);
    if (prev == null || rank[s] > rank[prev]) m.set(r.card_id, s);
  }
  return m;
}

// ───────────────────────────── orchestrazione ─────────────────────────────

function makeClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('ERROR: SUPABASE_URL e SUPABASE_SERVICE_KEY richiesti'); process.exit(1); }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchAllPages(makeQuery) {
  const PAGE = 1000;
  let out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const INCLUDE_RE = args.includes('--include-re');
  const JSON_OUT = args.find((a) => a.startsWith('--json='))?.split('=')[1] || null;
  const AUDIT_CRAWL = args.find((a) => a.startsWith('--audit-crawl='))?.split('=')[1] || null;
  const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0) || null;
  const DELAY_MS = Number(args.find((a) => a.startsWith('--delay-ms='))?.split('=')[1] || 150);

  console.log(`[fix-onepiece-image-source] ${APPLY ? 'APPLY (scrive su DB)' : 'DRY-RUN'}${INCLUDE_RE ? ' +RE' : ''}`);
  const sb = makeClient();

  // 1. Target: carte One Piece con image_url TCGplayer.
  const targets = await fetchAllPages((a, b) => sb.from('cards')
    .select('id, card_number, set_id, lang, name, rarity, print_variant, image_url, image_url_hi')
    .eq('tcg', 'onepiece').ilike('image_url', '%tcgplayer%')
    .order('id', { ascending: true }).range(a, b));
  const rows = LIMIT ? targets.slice(0, LIMIT) : targets;
  console.log(`  target (image_url tcgplayer): ${rows.length}`);

  // 2. Indice URL ufficiali già in uso (per twin resolution).
  const officialRows = await fetchAllPages((a, b) => sb.from('cards')
    .select('lang, card_number, image_url')
    .eq('tcg', 'onepiece').ilike('image_url', '%onepiece-cardgame.com%')
    .order('id', { ascending: true }).range(a, b));
  const officialIndex = buildOfficialIndex(officialRows);
  console.log(`  URL ufficiali indicizzati: ${officialRows.length} (${officialIndex.size} numeri distinti)`);

  // 3. Stato "before" da un crawl audit fresco, se fornito.
  let crawlState = new Map();
  let crawlAll = [];
  if (AUDIT_CRAWL && existsSync(AUDIT_CRAWL)) {
    crawlAll = readFileSync(AUDIT_CRAWL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    crawlState = crawlStateByCard(crawlAll);
    console.log(`  crawl audit: ${crawlAll.length} righe, ${crawlState.size} carte`);
  } else {
    console.log('  crawl audit: non fornito (--audit-crawl=) — before/after BROKEN/MISSING non calcolati');
  }

  const report = {
    generated_at: new Date().toISOString(),
    apply: APPLY, include_re: INCLUDE_RE,
    source_used: 'onepiece-cardgame.com (Bandai) — deterministico per card_number',
    total_targets: rows.length,
    dispositions: {},
    tiers: { twin: 0, base: 0, re: 0 },
    outcomes: { applied: 0, would_apply: 0, unresolved: 0, re_pending_review: 0, already_official: 0, errors: 0 },
    updates: [],       // { id, card_number, lang, tier, old_image_url, old_image_url_hi, new_url }
    unresolved: [],    // { id, card_number, name, reason }
    re_pending: [],     // { id, card_number, name }
    untouched: { ambiguous_variant: [], bundle: [], no_card_number: [] },
    errors: [],
  };
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

  // 4. Classifica + (per le resolvable) probe + eventuale scrittura.
  let n = 0;
  for (const c of rows) {
    n++;
    if (n % 25 === 0) process.stderr.write(`\r  ${n}/${rows.length}`);
    const cls = classifyCard(c, { officialIndex, includeRE: INCLUDE_RE });
    bump(report.dispositions, cls.disposition);

    if (cls.disposition === 'already_official') { report.outcomes.already_official++; continue; }
    if (cls.disposition === 'ambiguous_variant') {
      report.untouched.ambiguous_variant.push({ id: c.id, card_number: c.card_number, name: c.name });
      continue;
    }
    if (cls.disposition === 'bundle') {
      report.untouched.bundle.push({ id: c.id, name: c.name });
      continue;
    }
    if (cls.disposition === 'no_card_number') {
      report.untouched.no_card_number.push({ id: c.id, name: c.name });
      continue;
    }
    if (cls.disposition === 're_pending_review') {
      report.outcomes.re_pending_review++;
      report.re_pending.push({ id: c.id, card_number: c.card_number, name: c.name, candidate: cls.candidate });
      continue;
    }

    // resolvable → probe HTTP reale del candidato
    const verdict = await validateImageUrl(cls.candidate);
    await sleep(DELAY_MS);
    const decided = verdictFromProbe(verdict);
    if (decided.action === 'skip') {
      report.outcomes.unresolved++;
      report.unresolved.push({ id: c.id, card_number: c.card_number, name: c.name, tier: cls.tier, reason: decided.reason, candidate: cls.candidate });
      continue;
    }

    report.tiers[cls.tier]++;
    const upd = {
      id: c.id, card_number: c.card_number, lang: c.lang, tier: cls.tier,
      old_image_url: c.image_url, old_image_url_hi: c.image_url_hi, new_url: cls.candidate,
      crawl_before: crawlState.get(c.id) || null,
    };
    if (APPLY) {
      const { error } = await sb.from('cards')
        .update({ image_url: cls.candidate, image_url_hi: cls.candidate })
        .eq('id', c.id);
      if (error) { report.outcomes.errors++; report.errors.push({ id: c.id, error: error.message }); continue; }
      report.outcomes.applied++;
    } else {
      report.outcomes.would_apply++;
    }
    report.updates.push(upd);
  }
  process.stderr.write('\n');

  // 5. Before/after.
  const fixedCount = APPLY ? report.outcomes.applied : report.outcomes.would_apply;
  const fixedIds = new Set(report.updates.map((u) => u.id));
  const targetIds = new Set(rows.map((r) => r.id));

  let brokenBefore = null, brokenAfter = null, missingBefore = null, missingAfter = null, promoUnresolved = [];
  if (crawlState.size) {
    brokenBefore = 0; missingBefore = 0;
    for (const s of crawlState.values()) { if (s === 'BROKEN') brokenBefore++; else if (s === 'MISSING') missingBefore++; }
    let brokenFixed = 0, missingFixed = 0;
    for (const id of fixedIds) {
      const s = crawlState.get(id);
      if (s === 'BROKEN') brokenFixed++; else if (s === 'MISSING') missingFixed++;
    }
    brokenAfter = brokenBefore - brokenFixed;
    missingAfter = missingBefore - missingFixed;
    // promo / non-target ancora rotti (fuori scope di questo resolver)
    for (const [id, s] of crawlState) {
      if (s === 'VALID') continue;
      if (targetIds.has(id)) continue;
      promoUnresolved.push({ card_id: id, state: s });
    }
  }

  const sampleBefore = rows.length;
  const sampleAfter = rows.length - fixedCount;

  report.before_after = {
    sample: { before: sampleBefore, after: sampleAfter },
    broken: { before: brokenBefore, after: brokenAfter },
    missing: { before: missingBefore, after: missingAfter },
    high_confidence_fixed: fixedCount,
    unresolved: report.outcomes.unresolved + report.untouched.ambiguous_variant.length +
      report.untouched.bundle.length + report.untouched.no_card_number.length + promoUnresolved.length,
    re_pending_review: report.outcomes.re_pending_review,
    breakdown: {
      base_fixed: report.updates.filter((u) => u.tier === 'base').length,
      re_fixed: report.updates.filter((u) => u.tier === 're').length,
      twin_fixed: report.updates.filter((u) => u.tier === 'twin').length,
      alt_manga_sp_untouched: report.untouched.ambiguous_variant.length,
      no_card_number_untouched: report.untouched.no_card_number.length,
      bundle_untouched: report.untouched.bundle.length,
      promo_unresolved: promoUnresolved.length,
    },
    promo_unresolved_ids: promoUnresolved,
  };

  // 6. Output leggibile nel formato richiesto.
  const ba = report.before_after;
  const fmt = (v) => (v == null ? 'n/d' : v);
  console.log(`
SAMPLE:
  before: ${ba.sample.before}
  after:  ${ba.sample.after}

BROKEN:
  before: ${fmt(ba.broken.before)}
  after:  ${fmt(ba.broken.after)}

MISSING:
  before: ${fmt(ba.missing.before)}
  after:  ${fmt(ba.missing.after)}

HIGH-CONFIDENCE ${APPLY ? 'FIXED' : 'WOULD-FIX'}: ${ba.high_confidence_fixed}
UNRESOLVED: ${ba.unresolved}
RE PENDING REVIEW: ${ba.re_pending_review}

BASE fixed: ${ba.breakdown.base_fixed}
RE fixed: ${ba.breakdown.re_fixed}
TWIN fixed: ${ba.breakdown.twin_fixed}
ALT/MANGA/SP untouched: ${ba.breakdown.alt_manga_sp_untouched}
NO-CARD-NUMBER untouched: ${ba.breakdown.no_card_number_untouched}
BUNDLE untouched: ${ba.breakdown.bundle_untouched}
PROMO unresolved: ${ba.breakdown.promo_unresolved}`);

  console.log('\nFIX_ONEPIECE_IMAGE_REPORT=' + JSON.stringify({
    apply: APPLY, include_re: INCLUDE_RE,
    dispositions: report.dispositions, tiers: report.tiers, outcomes: report.outcomes,
    before_after: { ...ba, promo_unresolved_ids: undefined },
  }, null, 2));

  if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(report, null, 2)); console.log(`\nreport completo -> ${JSON_OUT}`); }
  if (report.outcomes.errors > 0) process.exitCode = 1;
}

// Eseguito come CLI diretto (non su import per i test).
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  main().catch((err) => { console.error('FATAL:', err.stack || err.message); process.exit(1); });
}
