// DraGold — Set slug helpers (Block 5, SEO Foundation for Sets)
//
// Schema deterministico: verificato su Supabase confrontando canonical_cards.slug
// coi rispettivi cards.tcg/set_id — il prefisso "set" di uno slug carta e' sempre
// `${tcg}-${set_id normalizzato}` (es. cards.set_id "sv10.5b" -> "sv10-5b" dentro
// "pokemon-sv10-5b-073"; "A1a" -> "a1a" dentro "pokemon-a1a-032"). Normalizzazione:
// lowercase + qualunque carattere non alfanumerico diventa "-". Riusando la stessa
// regola per /set/:slug, lo slug di un set e' identico al prefisso gia' presente
// nelle URL carta esistenti — nessuna nuova convenzione, nessun dato duplicato.
export function slugifySetId(setId) {
  return String(setId || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// Explorer/Set-Experience feature — collapses the last bit of variance that
// slugifySetId() alone doesn't: the SAME real set sometimes exists in `cards`
// under two id spellings that only differ by a hyphen between letters and
// digits (e.g. One Piece "OP-01" vs "op01"). Verified live on Supabase
// (2026-08-23, grouped every canonical_cards/cards set_id by this key across
// all 4 TCGs): every collision found is genuinely the same set under two
// source-id spellings, never two different sets — so merging on this key is
// safe. Used to (a) merge duplicate "set" rows when counting/joining sets for
// the Explorer/TCG hub, and (b) tolerate either spelling when resolving a
// /set/:slug back to a real cards.set_id.
export function normalizeSetKey(id) {
  return slugifySetId(id).replace(/-/g, '')
}

export function buildSetSlug(tcg, setId) {
  if (!tcg || !setId) return null
  return `${tcg}-${slugifySetId(setId)}`
}

const TCGS = ['pokemon', 'onepiece', 'mtg', 'ygo']

// Inversa: da uno slug "/set/:slug" ricava {tcg, setIdSlug}. I 4 nomi tcg non si
// sovrappongono mai come prefisso, quindi il match e' deterministico.
export function parseSetSlug(slug) {
  const s = String(slug || '')
  for (const tcg of TCGS) {
    if (s.startsWith(tcg + '-')) {
      const setIdSlug = s.slice(tcg.length + 1)
      if (setIdSlug) return { tcg, setIdSlug }
    }
  }
  return null
}
