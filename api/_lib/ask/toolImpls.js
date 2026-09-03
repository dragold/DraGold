// Ask DraGold — deterministic tool implementations (no LLM, no invention).
// Plain async functions so they can be unit-tested directly against a real
// Supabase client. tools.js wraps these in AI SDK tool() definitions.
//
// Reuses existing DraGold building blocks:
//   - public.search_cards RPC          (src/lib/search.js + migration 005)
//   - public.card_versions RPC         (Fase A cross-language identity)
//   - public.portfolio_valuations RPC  (Fase 3 — resolves aliases -> market_valuations)
//   - api/_lib/ebay.js + scripts/lib/valuation/ebay-browse.js  (Live Market)
//   - collection table + cards.illustrator / set_alias / canonical_cards (KG)

import { getEbayToken, MARKETPLACE_MAP } from '../ebay.js';
import { buildBrowseQuery, parseBrowseResponse, summarizeListings } from '../../../scripts/lib/valuation/ebay-browse.js';

const CARD_COLS = 'id,name,name_en,set_name,set_id,card_number,rarity,lang,tcg,canonical_card_id,illustrator';

function trimRows(rows, n) { return (rows || []).slice(0, n); }

// ─── Tool 1: card_search ────────────────────────────────────────────────────
export async function cardSearch(ctx, { query, tcg = null, lang = null, limit = 8 }) {
  const { sb } = ctx;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 25);
  const { data, error } = await sb.rpc('search_cards', {
    q: query, tcg_filter: tcg, lang_filter: lang || 'en', limit_n: lim,
  });
  if (error) return { error: `search_cards failed: ${error.message}`, results: [] };
  const ids = (data || []).map(r => r.id);
  let enrich = {};
  if (ids.length) {
    const { data: cards } = await sb.from('cards')
      .select('id,set_id,canonical_card_id,illustrator,name_en')
      .in('id', ids);
    for (const c of cards || []) enrich[c.id] = c;
  }
  return {
    count: (data || []).length,
    results: (data || []).map(r => ({
      card_id: r.id,
      name: r.name,
      name_en: enrich[r.id]?.name_en || null,
      tcg: r.tcg,
      lang: r.lang,
      set_name: r.set_name,
      set_id: enrich[r.id]?.set_id || null,
      card_number: r.card_number,
      rarity: r.rarity,
      canonical_card_id: enrich[r.id]?.canonical_card_id || null,
      illustrator: enrich[r.id]?.illustrator || null,
    })),
    note: 'Identity only. Prices from card_search are stale and intentionally omitted — use card_valuation.',
  };
}

// ─── Tool 2: card_versions ──────────────────────────────────────────────────
export async function cardVersions(ctx, { card_id = null, canonical_card_id = null, tcg = null, set_id = null, card_number = null }) {
  const { sb } = ctx;
  const { data, error } = await sb.rpc('card_versions', {
    p_card_id: card_id, p_canonical_card_id: canonical_card_id,
    p_tcg: tcg, p_set_id: set_id, p_card_number: card_number,
  });
  if (error) return { error: `card_versions failed: ${error.message}`, versions: [] };
  const rows = data || [];
  return {
    count: rows.length,
    concept_key: rows[0]?.xlang_key || null,
    versions: rows.map(r => ({
      card_id: r.card_id, lang: r.lang, tcg: r.tcg, set_id: r.set_id, set_name: r.set_name,
      card_number: r.card_number, name: r.name, name_en: r.name_en, rarity: r.rarity,
      slug: r.slug, is_query_row: r.is_query_row,
      link_basis: r.link_basis, link_confidence: r.link_confidence, alias_note: r.alias_note,
    })),
    guidance: rows.length <= 1
      ? 'Only the queried printing was found. There is no confirmed cross-language match — do not infer one from the name.'
      : 'link_basis self/same_canonical/set_alias/number_alias are curated/exact links. "same_concept" is a same-language spelling variant only.',
  };
}

// ─── Tool 3: card_valuation ─────────────────────────────────────────────────
export async function cardValuation(ctx, { card_id, currency = 'EUR' }) {
  const { sb } = ctx;
  const { data, error } = await sb.rpc('portfolio_valuations', { p_card_ids: [card_id] });
  if (error) return { error: `portfolio_valuations failed: ${error.message}` };
  const v = (data || [])[0];
  if (!v || v.estimated_value == null) {
    return {
      card_id, available: false,
      unavailable_reason: v?.unavailable_reason || 'no_data_yet',
      message: 'DraGold has no reliable market valuation for this printing yet.',
    };
  }
  let sources = [], newest = null;
  const { data: mv } = await sb.from('market_valuations')
    .select('sources,newest_observed_at,currency')
    .eq('card_id', v.resolved_card_id).eq('currency', currency).maybeSingle();
  if (mv) { sources = mv.sources || []; newest = mv.newest_observed_at; }
  return {
    card_id,
    resolved_card_id: v.resolved_card_id,
    resolved_via_alias: v.resolved_card_id !== card_id,
    value: Number(v.estimated_value),
    currency,
    range: { low: numOrNull(v.observed_low), median: numOrNull(v.observed_median), high: numOrNull(v.observed_high) },
    n_observations: v.n_observations,
    n_sources: v.n_sources,
    trend_7d_pct: numOrNull(v.trend_7d_pct),
    trend_30d_pct: numOrNull(v.trend_30d_pct),
    confidence: v.confidence,
    confidence_reason: v.confidence_reason,
    sources,
    as_of: v.computed_at,
    newest_observation_at: newest,
    disclaimer: 'This is a DraGold estimate aggregated from market sources, not a confirmed sale price.',
  };
}
function numOrNull(x) { return x == null ? null : Number(x); }

// ─── Tool 4: live_market ────────────────────────────────────────────────────
export async function liveMarket(ctx, { card_id, market = 'IT', limit = 6 }) {
  const { sb } = ctx;
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    return { available: false, reason: 'ebay_not_configured', message: 'Live Market needs eBay API credentials, which are not configured in this deployment.' };
  }
  const { data: card } = await sb.from('cards')
    .select('id,name,name_en,tcg,lang,set_name,card_number').eq('id', card_id).maybeSingle();
  if (!card) return { available: false, reason: 'card_not_found' };
  const mk = MARKETPLACE_MAP[market] || MARKETPLACE_MAP.IT;
  const q = buildBrowseQuery({ name: card.name_en || card.name, tcg: card.tcg, setName: card.set_name, number: card.card_number, lang: card.lang });
  let token;
  try { token = await getEbayToken(); } catch (e) { return { available: false, reason: 'ebay_auth_failed', detail: String(e.message).slice(0, 160) }; }
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(Math.min(parseInt(limit, 10) || 6, 12)));
  url.searchParams.set('sort', 'price');
  let filter = `buyingOptions:{FIXED_PRICE},priceCurrency:${mk.currency}`;
  if (market !== 'US' && market !== 'CA') filter += `,itemLocationCountry:${market}`;
  url.searchParams.set('filter', filter);
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': mk.id, Accept: 'application/json' } });
  if (!r.ok) return { available: false, reason: 'ebay_api_error', status: r.status };
  const { listings, count } = parseBrowseResponse(await r.json(), mk.currency);
  return {
    available: true,
    market: mk.id,
    query: q,
    as_of: new Date().toISOString(),
    listings: trimRows(listings, 8).map(l => ({ title: l.title, price: l.price, currency: l.currency, condition: l.condition, url: l.url })),
    summary: { ...summarizeListings(listings), total: count },
    note: 'ACTIVE listings ("what the market is asking now"), not sold prices and not a DraGold valuation.',
  };
}

// ─── Tool 5: collection ─────────────────────────────────────────────────────
export async function collection(ctx, { mode = 'summary', set_id = null }) {
  const { userSb } = ctx;
  if (!userSb) return { available: false, reason: 'sign_in_required', message: 'The collection is per-user. Ask DraGold needs the user to be signed in to read it.' };

  const { data: rows, error } = await userSb.from('collection').select('*');
  if (error) return { available: false, reason: 'read_failed', detail: error.message };
  const items = rows || [];
  if (!items.length) return { available: true, mode, total_cards: 0, message: 'The collection is empty.' };

  if (mode === 'set_completion') {
    if (!set_id) return { error: 'set_completion needs set_id' };
    const { sb } = ctx;
    const { count: totalInSet } = await sb.from('cards')
      .select('id', { count: 'exact', head: true }).eq('set_id', set_id).eq('lang', 'en');
    // best-effort: owned rows tagged to this set by card_api_id containing the set code
    const ownedInSet = items.filter(i => (i.card_api_id || '').toLowerCase().includes(String(set_id).toLowerCase())).length;
    return {
      available: true, mode, set_id,
      total_cards_en: totalInSet ?? null,
      owned_estimate: ownedInSet,
      missing_estimate: totalInSet != null ? Math.max(totalInSet - ownedInSet, 0) : null,
      caveat: 'Set-completion is a best-effort estimate: collection rows are not always tagged with a set_id.',
    };
  }

  // summary
  const { sb } = ctx;
  const cardIds = items.map(i => `${i.tcg}:${i.card_api_id}`).filter(Boolean).slice(0, 400);
  const { data: vals } = await sb.rpc('portfolio_valuations', { p_card_ids: cardIds });
  const valByInput = new Map((vals || []).map(v => [v.input_card_id, v]));
  let totalEur = 0, valued = 0, unvalued = 0;
  const confMix = { medium: 0, low: 0, none: 0 };
  for (const it of items) {
    const key = `${it.tcg}:${it.card_api_id}`;
    const v = valByInput.get(key);
    const qty = it.quantity || 1;
    if (v && v.estimated_value != null) {
      totalEur += Number(v.estimated_value) * qty;
      valued += qty;
      confMix[v.confidence === 'low' ? 'low' : 'medium'] += qty;
    } else {
      unvalued += qty;
      confMix.none += qty;
    }
  }
  return {
    available: true, mode: 'summary',
    total_cards: items.reduce((s, i) => s + (i.quantity || 1), 0),
    distinct_cards: items.length,
    estimated_total_eur: +totalEur.toFixed(2),
    valued_cards: valued,
    unvalued_cards: unvalued,
    confidence_mix: confMix,
    disclaimer: 'Estimated collection value from DraGold valuations (aggregated market estimates, mostly one source). Cards without reliable data are excluded from the total.',
  };
}

// ─── Tool 6: knowledge_graph ───────────────────────────────────────────────
export async function knowledgeGraph(ctx, { card_id }) {
  const { sb } = ctx;
  const { data: card } = await sb.from('cards').select(CARD_COLS).eq('id', card_id).maybeSingle();
  if (!card) return { error: 'card_not_found' };

  // cross-language / cross-region — the strongest real KG edge (Fase A)
  const { data: cv } = await sb.rpc('card_versions', { p_card_id: card_id });
  const crossLang = (cv || []).filter(r => r.card_id !== card_id).map(r => ({
    card_id: r.card_id, lang: r.lang, set_id: r.set_id, card_number: r.card_number,
    name: r.name, link_basis: r.link_basis, link_confidence: r.link_confidence, alias_note: r.alias_note,
  }));

  // same illustrator
  let sameIllustrator = [];
  if (card.illustrator) {
    const { data: ill } = await sb.from('cards')
      .select('id,name,set_name,card_number,lang,tcg')
      .eq('illustrator', card.illustrator).neq('id', card_id).limit(8);
    sameIllustrator = ill || [];
  }

  // set relationship (cross-region set mapping)
  const { data: sa } = await sb.from('set_alias')
    .select('alias_set_id,canonical_set_id,relation,confidence,note')
    .eq('tcg', card.tcg)
    .or(`alias_set_id.eq.${card.set_id},canonical_set_id.eq.${card.set_id}`);

  // reprints / variants: same canonical_card_id
  let reprints = [];
  if (card.canonical_card_id) {
    const { data: rp } = await sb.from('cards')
      .select('id,name,set_name,set_id,card_number,lang,print_variant')
      .eq('canonical_card_id', card.canonical_card_id).neq('id', card_id).limit(8);
    reprints = rp || [];
  }

  return {
    card: { card_id: card.id, name: card.name, name_en: card.name_en, set: card.set_name, set_id: card.set_id, number: card.card_number, illustrator: card.illustrator, tcg: card.tcg, lang: card.lang },
    cross_language: crossLang,
    same_illustrator: sameIllustrator,
    set_relationships: sa || [],
    reprints_and_variants: reprints,
    roadmap_note: 'DraGold KG today: cross-language identity (curated, Fase A), illustrator links, set/region relationships, canonical reprints/variants. A normalized graph (characters, series, typed edges) is on the roadmap — those are NOT available yet.',
  };
}
