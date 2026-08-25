// DraGold — per-TCG set list, shared by the /:tcg SEO hub (pages/tcg/tcgPageData.js)
// and the in-app Explorer tab (pages/sets/SetsView.jsx). Explorer/Set-Experience
// feature. One computation, one cache, reused by both surfaces — no duplicate
// "count sets per tcg" implementation.
//
// Fixes a real bug found while building this (verified on Supabase, 2026-08-23):
// the previous version keyed sets by slugifySetId(cards.set_id) alone, which does
// NOT collapse the letter/digit hyphen difference some source rows have for the
// very same set (e.g. One Piece "OP-01" vs "op01" — 17/31 One Piece sets affected,
// plus several Pokémon sets like "sm10"/"SM10", "sv3"/"SV3"). Those rows were being
// counted as separate "sets", and — for One Piece specifically — only the no-hyphen
// spelling happened to match set_logos.set_code, so the hyphenated one silently lost
// its logo/release date. Fixed by grouping on normalizeSetKey() (see lib/setSlug.js)
// instead, confirmed via a live query that every such collision is the same real set
// under two id spellings, never two different sets.
import { supabase } from '../supabase.js'
import { slugifySetId, normalizeSetKey, buildSetSlug } from './setSlug.js'

const MAX_ROWS = 50000

async function fetchSetIdCounts(tcg) {
  // canonical_cards is much lighter than cards (88k vs 201k rows) and is the
  // primary source (same choice already made in tcgPageData.js) — except for
  // One Piece, where canonical_cards.set_id is NULL 100% of the time
  // (verified previously, see tcgPageData.js history), so it falls back to
  // cards.set_id there. Same fallback rule kept here, unchanged.
  const counts = new Map() // normKey -> Map<rawSetId, count>
  const bump = (rawId) => {
    const normKey = normalizeSetKey(rawId)
    if (!normKey) return
    let group = counts.get(normKey)
    if (!group) { group = new Map(); counts.set(normKey, group) }
    group.set(rawId, (group.get(rawId) || 0) + 1)
  }

  const { data: ccRows } = await supabase
    .from('canonical_cards')
    .select('set_id')
    .eq('tcg', tcg)
    .not('set_id', 'is', null)
    .limit(MAX_ROWS)
  for (const r of ccRows || []) bump(r.set_id)

  if (!counts.size) {
    const { data: cardRows } = await supabase
      .from('cards')
      .select('set_id')
      .eq('tcg', tcg)
      .not('set_id', 'is', null)
      .limit(MAX_ROWS)
    for (const r of cardRows || []) bump(r.set_id)
  }

  return counts
}

function pickCanonicalSetId(group, logoByNormKey, normKey) {
  // Prefer whichever raw spelling already slug-matches a real set_logos row
  // (keeps existing, already-correct /set/:slug URLs stable for the sets that
  // never had this bug) — else the spelling with the most rows.
  const logo = logoByNormKey.get(normKey)
  if (logo) {
    for (const rawId of group.keys()) {
      if (slugifySetId(rawId) === slugifySetId(logo.set_code)) return rawId
    }
  }
  let best = null, bestN = -1
  for (const [rawId, n] of group) if (n > bestN) { best = rawId; bestN = n }
  return best
}

function parseDate(d) {
  if (!d) return null
  const t = new Date(d)
  return isNaN(t.getTime()) ? null : t
}

// Core algorithm. Returns { sets, setCount } — sets sorted release_date DESC
// (newest first), sets with no known release date appended after, by name —
// never invented, only what set_logos already has (pokemon + onepiece today;
// mtg/ygo have no release-date source in this DB, so every mtg/ygo set falls
// into the "no date" tail, sorted by name — same graceful fallback, no dates
// fabricated).
//
// Shape is intentionally set-centric only (no assumption baked in that a set
// "has only cards") — a future Promos/Products layer can be added alongside
// `cards` without changing this function's contract.
export async function computeTcgSets(tcg) {
  const counts = await fetchSetIdCounts(tcg)
  if (!counts.size) return { sets: [], setCount: 0 }

  // Name/logo/release date where real (set_logos covers pokemon + onepiece
  // only, see Block 5 history) — never invented for mtg/ygo.
  const { data: logoRows } = await supabase
    .from('set_logos')
    .select('set_code, set_name, logo_url, release_date')
    .eq('tcg', tcg)
  const logoByNormKey = new Map((logoRows || []).map(r => [normalizeSetKey(r.set_code), r]))

  const sets = [...counts.entries()].map(([normKey, group]) => {
    const setId = pickCanonicalSetId(group, logoByNormKey, normKey)
    const cardCount = [...group.values()].reduce((a, b) => a + b, 0)
    const logo = logoByNormKey.get(normKey) || null
    const releaseDate = logo?.release_date || null
    const releaseYear = releaseDate ? new Date(releaseDate).getFullYear() : null
    return {
      slug: buildSetSlug(tcg, setId),
      setId,
      setName: logo?.set_name || setId,
      logoUrl: logo?.logo_url || null,
      releaseDate,
      releaseYear,
      cardCount,
    }
  })

  sets.sort((a, b) => {
    const da = parseDate(a.releaseDate), db = parseDate(b.releaseDate)
    if (da && db) return db - da
    if (da && !db) return -1
    if (!da && db) return 1
    return a.setName.localeCompare(b.setName)
  })

  return { sets, setCount: sets.length }
}

// Shared in-memory cache (module singleton — no persistence, cleared on full
// reload). Both the SEO hub page and the in-app Explorer tab call through
// this so a TCG's set list is computed once per page/session, not once per
// consumer.
const _cache = new Map() // tcg -> Promise<{sets,setCount}>

export function loadTcgSets(tcg) {
  if (!supabase || !tcg) return Promise.resolve({ sets: [], setCount: 0 })
  if (!_cache.has(tcg)) {
    _cache.set(tcg, computeTcgSets(tcg).catch(() => ({ sets: [], setCount: 0 })))
  }
  return _cache.get(tcg)
}

// Explorer language grouping (Explorer + Catalog Completeness task, 2026-08-25).
//
// Verified live on Supabase before writing this: only pokemon and onepiece
// have any cards.lang other than 'en' (mtg/ygo are 100% 'en' — confirmed by
// `select tcg, count(distinct set_id) from cards where lang != 'en' group by
// tcg`, which returns only pokemon/onepiece rows). So which TCGs get a
// "Japanese" section is detected live per tcg (detectJapaneseSets below), not
// hardcoded — a 5th tcg or a future ja source for mtg/ygo needs no code change.
//
// Within pokemon, 'ja' is its own real set_id namespace (e.g. CP1, E1..E5,
// M1L, M2a, PCG1..9 — verified live, zero overlap with the en/fr/de/it/es/pt
// namespace of base1/bw1/swshp/...). The other 9 non-en pokemon languages
// (fr/de/it/es/pt/zh-tw/th/id/zh-cn/ko) instead reuse the SAME set_id as the
// en row for the same physical set (verified: cards.set_id='base1' has
// en/it/de/fr rows, all one set) — they are print-language variants of a set
// already represented by the "International" (en) entry, not a distinct set
// identity, so they're deliberately not exploded into their own Explorer
// sections (CLAUDE.md §1 product priority is EN/JA; a 12-language filter row
// would also violate this task's explicit "avoid a huge language filter").
//
// Within onepiece, 'ja' sets (OP-01, ST-01, ...) collide with their en
// counterpart (OP01, ST01) under normalizeSetKey() — same real set under two
// source-id spellings (see setSlug.js) — so the ja entry below reuses the
// same set_logos row (name/logo/release date) as the en entry: not a
// duplicate identity, not an invented asset, just the same official source
// already used for the International entry.
function parseDateLoose(d) {
  if (!d) return null
  const t = new Date(d)
  return isNaN(t.getTime()) ? null : t
}

// Same shape as computeTcgSets, but scoped to one cards.lang value instead of
// the language-agnostic canonical_cards/cards union. Used for the "Japanese"
// Explorer section of pokemon/onepiece — computeTcgSets itself stays
// untouched (still used as-is by mtg/ygo, which have no lang variation).
export async function computeLangSets(tcg, lang) {
  if (!supabase || !tcg || !lang) return { sets: [], setCount: 0 }

  const counts = new Map() // normKey -> Map<rawSetId, count>
  const { data: rows } = await supabase
    .from('cards')
    .select('set_id')
    .eq('tcg', tcg).eq('lang', lang)
    .not('set_id', 'is', null)
    .limit(MAX_ROWS)
  for (const r of rows || []) {
    const normKey = normalizeSetKey(r.set_id)
    if (!normKey) continue
    let group = counts.get(normKey)
    if (!group) { group = new Map(); counts.set(normKey, group) }
    group.set(r.set_id, (group.get(r.set_id) || 0) + 1)
  }
  if (!counts.size) return { sets: [], setCount: 0 }

  // Real name for this language, from the cards rows themselves (e.g. native
  // Japanese set names — verified populated for pokemon/onepiece ja rows) —
  // used only as a fallback when set_logos has no matching row for this set.
  const nameByNormKey = new Map()
  const { data: nameRows } = await supabase
    .from('cards')
    .select('set_id, set_name')
    .eq('tcg', tcg).eq('lang', lang)
    .not('set_name', 'is', null)
    .limit(MAX_ROWS)
  for (const r of nameRows || []) {
    const normKey = normalizeSetKey(r.set_id)
    if (normKey && !nameByNormKey.has(normKey)) nameByNormKey.set(normKey, r.set_name)
  }

  const { data: logoRows } = await supabase
    .from('set_logos')
    .select('set_code, set_name, logo_url, release_date')
    .eq('tcg', tcg)
  const logoByNormKey = new Map((logoRows || []).map(r => [normalizeSetKey(r.set_code), r]))

  const sets = [...counts.entries()].map(([normKey, group]) => {
    const setId = pickCanonicalSetId(group, logoByNormKey, normKey)
    const cardCount = [...group.values()].reduce((a, b) => a + b, 0)
    const logo = logoByNormKey.get(normKey) || null
    const releaseDate = logo?.release_date || null
    return {
      slug: buildSetSlug(tcg, setId),
      setId,
      setName: logo?.set_name || nameByNormKey.get(normKey) || setId,
      logoUrl: logo?.logo_url || null,
      releaseDate,
      releaseYear: releaseDate ? new Date(releaseDate).getFullYear() : null,
      cardCount,
      lang,
    }
  })

  sets.sort((a, b) => {
    const da = parseDateLoose(a.releaseDate), db = parseDateLoose(b.releaseDate)
    if (da && db) return db - da
    if (da && !db) return -1
    if (!da && db) return 1
    return a.setName.localeCompare(b.setName)
  })

  return { sets, setCount: sets.length }
}

const _langCache = new Map() // `${tcg}:${lang}` -> Promise<{sets,setCount}>

export function loadLangSets(tcg, lang) {
  if (!supabase || !tcg || !lang) return Promise.resolve({ sets: [], setCount: 0 })
  const key = `${tcg}:${lang}`
  if (!_langCache.has(key)) {
    _langCache.set(key, computeLangSets(tcg, lang).catch(() => ({ sets: [], setCount: 0 })))
  }
  return _langCache.get(key)
}

// Cheap live existence check ("does this tcg have any ja cards at all?") —
// one row, head-less .limit(1) query, cached per tcg. Never hardcoded to
// pokemon/onepiece: a future tcg/source adding ja data needs no code change
// here, and a tcg without ja data (mtg/ygo today) never shows an empty/dead
// "Japanese" section.
const _jaAvailCache = new Map() // tcg -> Promise<boolean>

export function detectJapaneseSets(tcg) {
  if (!supabase || !tcg) return Promise.resolve(false)
  if (!_jaAvailCache.has(tcg)) {
    _jaAvailCache.set(tcg, supabase
      .from('cards').select('id').eq('tcg', tcg).eq('lang', 'ja').limit(1)
      .then(({ data }) => !!(data && data.length))
      .catch(() => false))
  }
  return _jaAvailCache.get(tcg)
}
