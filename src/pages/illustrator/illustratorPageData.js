// DraGold — Illustrator Page data layer (blocco "Illustrator Pages")
// Query isolate per la pagina pubblica /illustrator/{slug}. Nessuna logica UI qui.
// Fonte unica: cards.illustrator (colonna reale gia' esistente e indicizzata,
// nessuna nuova tabella). Nessun dato bio/character inventato: se manca, la pagina
// mostra solo cio' che e' verificato (nome + carte reali collegate).
//
// Duplicate handling deterministico (stessa filosofia gia' usata per i Set —
// setPageData.js): cards.illustrator e' testo libero e la normalizzazione dello
// slug e' lossy. Verificato su Supabase che esistono varianti reali che collassano
// sullo stesso slug (es. "K. Hoshiba" / "K Hoshiba" -> "k-hoshiba"; "Takuyoa" /
// "takuyoa" -> "takuyoa"; "Shinji Higuchi + Sachiko Eba" in 3 formattazioni diverse
// di spazi/slash). Non si sceglie arbitrariamente una variante scartando le altre:
// si aggregano TUTTE le varianti che condividono lo slug (stessa persona, formattazione
// diversa) e si sceglie come nome visualizzato quella con piu' carte, tie-break
// alfabetico — deterministico e ripetibile ad ogni richiesta.
import { supabase } from '../../supabase.js'
import { groupByCanonical } from '../../lib/search.js'
import { slugifyIllustrator } from '../../lib/illustratorSlug.js'

const LISTING_CAP = 400 // stesso cap di setPageData.js: niente migliaia di righe nel markup iniziale
// cards.illustrator e' popolato solo per tcg='pokemon' (33.606 righe, verificato su
// Supabase). Fetch della sola colonna illustrator (query leggera, indicizzata) fino a
// un margine ampio: stesso principio gia' usato in api/sitemap-sets.js/tcgPageData.js
// per evitare uno scan delle 200k+ righe di cards con tutte le colonne.
const ILLUSTRATOR_SCAN_CAP = 40000
// Dimensione di pagina per il loop di paginazione sotto — vedi commento su
// fetchAllIllustratorValues per il motivo per cui e' necessaria una paginazione
// esplicita e non basta un singolo .limit(ILLUSTRATOR_SCAN_CAP).
const SCAN_PAGE_SIZE = 1000

// BUG FIX (verificato su dati reali): un singolo .select('illustrator').limit(40000)
// SENZA .order() non garantisce di leggere l'intera colonna. Il server (PostgREST/
// Supabase) applica un limite massimo di righe per singola richiesta REST (il
// .limit() del client non lo supera), e SENZA un ORDER BY esplicito Postgres
// restituisce le righe nell'ordine fisico dello scan — che su questa tabella e'
// fortemente raggruppato per illustrator (probabile effetto di inserimenti bulk a
// batch dalla pipeline di sync). Risultato verificato via SQL: le prime 1000 righe
// non ordinate contengono 851 righe di "5ban Graphics" e pochissimi altri valori —
// "Ken Sugimori" (1735 carte) e "Mitsuhiro Arita" (1232 carte) non compaiono affatto
// in quel campione, pur essendo il 2° e 3° illustrator piu' frequente in assoluto.
// Questo e' esattamente il motivo per cui /illustrator/ken-sugimori e
// /illustrator/mitsuhiro-arita risultavano "not found": il Passo 1 sotto non vedeva
// mai il loro valore raw tra le varianti candidate.
// Fix minimo: paginare esplicitamente con .range() avanzando dell'esatto numero di
// righe restituite ad ogni round-trip (non un valore fisso), fermandosi solo quando
// una pagina torna vuota o si raggiunge ILLUSTRATOR_SCAN_CAP — cosi' la copertura e'
// completa indipendentemente dal limite reale imposto dal server per singola
// richiesta e dall'ordine fisico delle righe.
async function fetchAllIllustratorValues() {
  const seen = new Set()
  let offset = 0
  while (offset < ILLUSTRATOR_SCAN_CAP) {
    const { data, error } = await supabase
      .from('cards')
      .select('illustrator')
      .not('illustrator', 'is', null)
      .neq('illustrator', '')
      .range(offset, offset + SCAN_PAGE_SIZE - 1)
    if (error || !data || !data.length) break
    for (const r of data) if (r.illustrator) seen.add(r.illustrator)
    offset += data.length // avanza di cio' che e' stato REALMENTE restituito, non della page size richiesta
    if (data.length < SCAN_PAGE_SIZE) break // pagina parziale = fine dei dati
  }
  return seen
}

export async function getIllustratorPageData(slug) {
  if (!supabase || !slug) return null

  // Passo 1: tutti i valori distinti reali di cards.illustrator, per trovare quali
  // normalizzano sullo slug richiesto (necessario perche' la normalizzazione e'
  // lossy: non si puo' risalire al valore raw dallo slug senza confrontarli tutti).
  const seen = await fetchAllIllustratorValues()
  const variants = [...seen].filter(name => slugifyIllustrator(name) === slug)
  if (!variants.length) return null

  // Passo 2: se piu' varianti collassano sullo stesso slug, il nome canonico
  // visualizzato e' deterministico (piu' carte, poi ordine alfabetico) — non una
  // scelta arbitraria e non cambia ad ogni richiesta.
  let canonicalName = variants[0]
  if (variants.length > 1) {
    const { data: countRows } = await supabase.from('cards').select('illustrator').in('illustrator', variants).limit(5000)
    const counts = new Map()
    for (const r of countRows || []) counts.set(r.illustrator, (counts.get(r.illustrator) || 0) + 1)
    canonicalName = [...variants].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b))[0]
  }

  const FIELDS = 'id,tcg,name,set_id,set_name,card_number,image_url,image_url_hi,lang,canonical_card_id,illustrator'
  const { data: enRows } = await supabase.from('cards').select(FIELDS).in('illustrator', variants).eq('lang', 'en').limit(LISTING_CAP)
  let rows = enRows || []
  let langUsed = 'en'
  if (!rows.length) {
    // Illustratore senza righe 'en' (es. solo carte JP): stesso fallback gia' usato
    // in setPageData.js/cardPageData.js.
    const { data: anyRows } = await supabase.from('cards').select(FIELDS).in('illustrator', variants).limit(LISTING_CAP)
    rows = anyRows || []
    langUsed = null
  }
  if (!rows.length) return null

  const deduped = groupByCanonical(rows)
  const hasMore = rows.length >= LISTING_CAP

  // Link reali Illustrator -> Card (canonical_cards.slug, stessa fonte di verita'
  // gia' usata in setPageData.js/CardPage.jsx/middleware.js).
  const ccIds = [...new Set(deduped.map(c => c.canonical_card_id).filter(Boolean))]
  let slugMap = new Map()
  if (ccIds.length) {
    const { data: ccRows } = await supabase.from('canonical_cards').select('id, slug').in('id', ccIds)
    slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]))
  }
  const cardsOut = deduped
    .map(c => ({ ...c, cardSlug: c.canonical_card_id ? slugMap.get(c.canonical_card_id) || null : null }))
    .filter(c => c.cardSlug) // solo link reali in pagina pubblica: nessuna entry senza slug valido

  if (!cardsOut.length) return null

  const tcgs = [...new Set(rows.map(c => c.tcg))].sort()

  return {
    slug,
    name: canonicalName,
    tcgs,
    langUsed,
    cardCount: cardsOut.length,
    hasMore,
    cards: cardsOut,
  }
}
