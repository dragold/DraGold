// DraGold — TCG Hub Page data layer (Block 6, TCG Hub SEO Foundation)
// Query isolate per la pagina pubblica /{tcg}. Nessuna logica UI qui.
// Lavora sui SET, non sulle carte (vedi vincolo performance del task): fonte
// primaria canonical_cards (88k righe totali, molto piu' leggera di cards con
// 201k), stesso principio gia' usato in api/sitemap-sets.js (Block 5).
import { supabase } from '../../supabase.js'
import { getTcgHub } from '../../lib/tcgConfig.js'
import { slugifySetId } from '../../lib/setSlug.js'

const MAX_ROWS = 50000

export async function getTcgPageData(tcg) {
  const hub = getTcgHub(tcg)
  if (!hub || !supabase) return null

  // Stesso fix del Block 6 applicato a api/sitemap-sets.js: canonical_cards.set_id
  // e' NULL al 100% per tcg='onepiece' (verificato su Supabase, 2642/2642 righe),
  // quindi qui si ripiega su cards.set_id (sempre popolato) SOLO per i TCG dove
  // canonical_cards non produce nulla — non per tutti e 4, per restare leggeri.
  let counts = new Map() // slugId -> { setId, count }
  const { data: ccRows } = await supabase
    .from('canonical_cards')
    .select('set_id')
    .eq('tcg', tcg)
    .not('set_id', 'is', null)
    .limit(MAX_ROWS)
  for (const r of ccRows || []) {
    const slugId = slugifySetId(r.set_id)
    if (!slugId) continue
    const cur = counts.get(slugId)
    if (cur) cur.count++
    else counts.set(slugId, { setId: r.set_id, count: 1 })
  }

  if (!counts.size) {
    const { data: cardRows } = await supabase
      .from('cards')
      .select('set_id')
      .eq('tcg', tcg)
      .not('set_id', 'is', null)
      .limit(MAX_ROWS)
    for (const r of cardRows || []) {
      const slugId = slugifySetId(r.set_id)
      if (!slugId) continue
      const cur = counts.get(slugId)
      if (cur) cur.count++
      else counts.set(slugId, { setId: r.set_id, count: 1 })
    }
  }

  if (!counts.size) return { tcg, label: hub.label, description: hub.description, setCount: 0, sets: [] }

  // Nome/logo dove realmente disponibili (set_logos copre solo pokemon+onepiece,
  // vedi Block 5) — mai inventati per mtg/ygo.
  const { data: logoRows } = await supabase
    .from('set_logos')
    .select('set_code, set_name, logo_url')
    .eq('tcg', tcg)
  const logoMap = new Map((logoRows || []).map(r => [slugifySetId(r.set_code), r]))

  const sets = [...counts.entries()]
    .map(([slugId, { setId, count }]) => {
      const logo = logoMap.get(slugId)
      return {
        slug: `${tcg}-${slugId}`,
        setId,
        setName: logo?.set_name || setId,
        logoUrl: logo?.logo_url || null,
        cardCount: count,
      }
    })
    .sort((a, b) => b.cardCount - a.cardCount || a.setName.localeCompare(b.setName))

  return { tcg, label: hub.label, description: hub.description, setCount: sets.length, sets }
}
