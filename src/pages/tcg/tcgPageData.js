// DraGold — TCG Hub Page data layer (Block 6, TCG Hub SEO Foundation).
// Query isolate per la pagina pubblica /{tcg}. Nessuna logica UI qui.
//
// Explorer/Set-Experience feature: il calcolo vero e proprio (conteggio set,
// join coi loghi/release date, dedup id-variant, ordinamento release_date
// DESC) è stato estratto in lib/tcgSets.js — riusato anche dal tab Explorer
// in-app (pages/sets/SetsView.jsx), invece di due implementazioni parallele.
// Questo file resta solo il wrapper che aggiunge label/descrizione dell'hub.
import { getTcgHub } from '../../lib/tcgConfig.js'
import { loadTcgSets } from '../../lib/tcgSets.js'

export async function getTcgPageData(tcg) {
  const hub = getTcgHub(tcg)
  if (!hub) return null
  const { sets, setCount } = await loadTcgSets(tcg)
  return { tcg, label: hub.label, description: hub.description, logo: hub.logo, setCount, sets }
}
