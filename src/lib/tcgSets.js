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
