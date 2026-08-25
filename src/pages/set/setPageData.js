// DraGold — Set Page data layer (Block 5, SEO Foundation for Sets)
// Query isolate per la pagina pubblica /set/{slug}. Nessuna logica UI qui.
// Riusa deliberatamente cio' che gia' esiste e funziona in produzione:
// - setIdCandidates/naturalCompare da SetDetailPage.jsx (stesso problema di
//   mismatch set_id tra fonti, stessa soluzione, zero duplicazione)
// - groupByCanonical da lib/search.js (stesso dedup multi-source gia' usato
//   da SearchView e SetDetailPage.jsx)
// - set_logos per nome/logo/data quando disponibile (copre solo pokemon+
//   onepiece: 153+31 righe verificate su Supabase — per mtg/ygo questi campi
//   restano assenti, mai inventati)
import { supabase } from '../../supabase.js'
import { setIdCandidates, naturalCompare } from './SetDetailPage.jsx'
import { groupByCanonical } from '../../lib/search.js'
import { parseSetSlug, slugifySetId, normalizeSetKey } from '../../lib/setSlug.js'

const LISTING_CAP = 400 // vedi nota "PAGINAZIONE/PERFORMANCE" nel task: niente migliaia di righe nel markup iniziale

// Lo slug e' una normalizzazione lossy del cards.set_id reale (lowercase, ogni
// carattere non alfanumerico -> "-"). Per risalire al set_id con la casing/punteggiatura
// realmente in DB si ricostruiscono le forme plausibili (as-is, uppercase, "-" -> ".")
// e si passano a setIdCandidates() — stessa tecnica gia' provata in SetDetailPage.jsx
// per il mismatch case tra fonti.
function rawSetIdCandidates(setIdSlug) {
  const dotted = setIdSlug.replace(/-/g, '.')
  const seed = new Set([setIdSlug, setIdSlug.toUpperCase(), dotted, dotted.toUpperCase()])
  for (const c of [...seed]) for (const v of setIdCandidates(c)) seed.add(v)
  return [...seed]
}

export async function getSetPageData(slug) {
  if (!supabase || !slug) return null
  const parsed = parseSetSlug(slug)
  if (!parsed) return null
  const { tcg, setIdSlug } = parsed

  // Passo 1: trova il set_id reale (con la casing effettiva in `cards`) tra i candidati.
  // .order() rende deterministico quale spelling viene scelto quando piu' righe
  // con set_id diversi (es. "OP-01" e "op01") sono entrambe candidate per lo
  // stesso slug — vedi normalizeSetKey in lib/setSlug.js.
  const { data: probeRows } = await supabase
    .from('cards')
    .select('set_id')
    .eq('tcg', tcg)
    .in('set_id', rawSetIdCandidates(setIdSlug))
    .order('set_id', { ascending: true })
    .limit(1)
  const realSetId = probeRows?.[0]?.set_id
  if (!realSetId) return null

  // Verifica di determinismo: lo slug ricostruito dal set_id trovato deve combaciare
  // (a livello di normalizeSetKey, non piu' di uguaglianza esatta — Explorer/Set-
  // Experience fix, 2026-08-23) con quello richiesto, altrimenti due set_id diversi
  // potrebbero collassare sullo stesso slug (collisione, non osservata sui dati
  // reali ma non esclusa a priori) — in quel caso non si sceglie arbitrariamente,
  // si tratta come not-found. La versione precedente usava uguaglianza esatta su
  // slugifySetId(), che rifiutava erroneamente set_id validi trovati con
  // punteggiatura diversa da quella dello slug richiesto (es. slug "onepiece-op01"
  // -> probe trova "OP-01", slugifySetId("OP-01")="op-01" != "op01" -> falso 404).
  if (normalizeSetKey(realSetId) !== normalizeSetKey(setIdSlug)) return null

  const candidates = setIdCandidates(realSetId)
  // Task 7 (Set Page UX/Completion): rarity + print_variant aggiunti alla
  // stessa query esistente (nessuna query in piu') per il tile "rarity/variant
  // quando realmente disponibile" richiesto dalla Card Grid.
  const FIELDS = 'id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,canonical_card_id,series_name,rarity,print_variant'

  const [{ data: enRows }, { data: logoRows }] = await Promise.all([
    supabase.from('cards').select(FIELDS).eq('tcg', tcg).in('set_id', candidates).eq('lang', 'en').limit(LISTING_CAP),
    supabase.from('set_logos').select('*').eq('tcg', tcg).in('set_code', candidates).limit(1),
  ])

  let rows = enRows || []
  let langUsed = 'en'
  if (!rows.length) {
    // Set senza alcuna riga 'en' (es. set solo-JP): fallback a qualunque lingua,
    // stesso pattern del fallback nome usato in SetDetailPage.jsx.
    const { data: anyRows } = await supabase.from('cards').select(FIELDS).eq('tcg', tcg).in('set_id', candidates).limit(LISTING_CAP)
    rows = anyRows || []
    langUsed = null
  }
  if (!rows.length) return null

  const deduped = groupByCanonical(rows).slice().sort((a, b) => naturalCompare(a.card_number, b.card_number))
  const hasMore = rows.length >= LISTING_CAP

  // slug delle Card Page per il collegamento reale Set -> Card (canonical_cards.slug,
  // stessa fonte di verita' gia' usata in cardPageData.js/middleware.js).
  const ccIds = [...new Set(deduped.map(c => c.canonical_card_id).filter(Boolean))]
  let slugMap = new Map()
  if (ccIds.length) {
    const { data: ccRows } = await supabase.from('canonical_cards').select('id, slug').in('id', ccIds)
    slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]))
  }
  const cardsOut = deduped.map(c => ({ ...c, cardSlug: c.canonical_card_id ? slugMap.get(c.canonical_card_id) || null : null }))

  const logo = logoRows?.[0] || null
  const enSample = rows.find(c => c.lang === 'en') || rows[0]
  const setName = logo?.set_name || enSample?.set_name || realSetId
  const seriesName = enSample?.series_name || null

  return {
    tcg,
    setId: realSetId,
    slug: `${tcg}-${setIdSlug}`,
    setName,
    seriesName,
    logoUrl: logo?.logo_url || null,
    releaseDate: logo?.release_date || null,
    langUsed,
    cardCount: cardsOut.length,
    hasMore,
    cards: cardsOut,
  }
}

// Task 7 (Set Page UX/Completion) — set precedente/successivo nella stessa
// serie, SOLO quando set_logos ha davvero un release_date per il set corrente
// (oggi verificato solo per pokemon+onepiece, vedi commento in cima al file):
// senza una data reale non esiste un ordine da cui derivare "precedente" o
// "successivo" senza inventarlo. Query separata e leggera (set_logos e' una
// tabella piccola, un solo giro per tutti i set di un tcg, non per-card).
export async function getAdjacentSets(tcg, setId) {
  if (!supabase || !tcg || !setId) return null
  const { data } = await supabase
    .from('set_logos')
    .select('set_code, set_name, logo_url, release_date')
    .eq('tcg', tcg)
    .not('release_date', 'is', null)
    .order('release_date', { ascending: true })
  if (!data || !data.length) return null
  const idx = data.findIndex(s => normalizeSetKey(s.set_code) === normalizeSetKey(setId))
  if (idx === -1) return null
  return {
    prev: idx > 0 ? data[idx - 1] : null,
    next: idx < data.length - 1 ? data[idx + 1] : null,
  }
}
