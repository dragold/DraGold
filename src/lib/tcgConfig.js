// DraGold — TCG Hub static config (Block 6, TCG Hub SEO Foundation).
// Nessuna nuova tabella, nessun nuovo sistema di mapping: i 4 valori tcg sono
// gia' quelli reali di cards.tcg/canonical_cards.tcg, e coincidono con il path
// URL richiesto (/pokemon, /onepiece, /mtg, /ygo) — zero mapping aggiuntivo.
// Qui si aggiungono solo label/descrizione, dati statici minimi per la UI/SEO.
//
// logo/color (Explorer/Set-Experience feature): stessi asset e stessi valori
// gia' presenti in DraGold.jsx (TCG_LIST) — duplicati qui deliberatamente,
// non spostati: TcgPage.jsx/SetPage.jsx sono entry point standalone separati
// (main.jsx li monta senza il componente DraGold), importare da DraGold.jsx
// trascinerebbe l'intero componente SPA in un bundle che deve restare
// leggero/SEO-first. Aggiungere una quinta riga qui (es. lorcana) in futuro
// non richiede refactoring — solo un nuovo oggetto in questo array.
export const TCG_HUBS = [
  { tcg: 'pokemon', label: 'Pokémon', description: 'Pokémon Trading Card Game — every set from the original Base Set to the latest release. Browse cards, sets and rarities, and track your own collection.', logo: '/logos/pkm.png', color: '#f87171' },
  { tcg: 'onepiece', label: 'One Piece', description: 'One Piece Card Game — every set, every card. Browse the full catalog and track your own collection.', logo: '/logos/op.png', color: '#f97316' },
  { tcg: 'mtg', label: 'Magic: The Gathering', description: 'Magic: The Gathering — decades of sets, from vintage to the latest release. Browse cards, sets and rarities, and track your own collection.', logo: '/logos/mtg.png', color: '#60a5fa' },
  { tcg: 'ygo', label: 'Yu-Gi-Oh!', description: 'Yu-Gi-Oh! Trading Card Game — every set, every card. Browse the full catalog and track your own collection.', logo: '/logos/ygo.png', color: '#fbbf24' },
]

export function getTcgHub(tcg) {
  return TCG_HUBS.find(h => h.tcg === tcg) || null
}

// Costanti interne per i 4 TCG supportati. Non esportata (usa TCG_HUBS per
// introspection se serve). Nome maiuscolo per coerenza con altre costanti.
const TCGS = ['pokemon', 'onepiece', 'mtg', 'ygo']
