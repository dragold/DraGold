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
