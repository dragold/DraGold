// DraGold — TCG Hub static config (Block 6, TCG Hub SEO Foundation).
// Nessuna nuova tabella, nessun nuovo sistema di mapping: i 4 valori tcg sono
// gia' quelli reali di cards.tcg/canonical_cards.tcg, e coincidono con il path
// URL richiesto (/pokemon, /onepiece, /mtg, /ygo) — zero mapping aggiuntivo.
// Qui si aggiungono solo label/descrizione, dati statici minimi per la UI/SEO.
export const TCG_HUBS = [
  { tcg: 'pokemon', label: 'Pokémon', description: 'Pokémon Trading Card Game — every set from the original Base Set to the latest release, with real market prices and rarities.' },
  { tcg: 'onepiece', label: 'One Piece', description: 'One Piece Card Game — every set, every card, with real market prices tracked in real time.' },
  { tcg: 'mtg', label: 'Magic: The Gathering', description: 'Magic: The Gathering — decades of sets, from vintage to the latest release, with real market prices.' },
  { tcg: 'ygo', label: 'Yu-Gi-Oh!', description: 'Yu-Gi-Oh! Trading Card Game — every set, every card, with real market prices in one place.' },
]

export function getTcgHub(tcg) {
  return TCG_HUBS.find(h => h.tcg === tcg) || null
}
