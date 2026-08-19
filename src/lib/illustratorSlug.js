// DraGold — Illustrator slug helper (blocco "Illustrator Pages")
//
// Fonte unica: cards.illustrator (colonna reale, indicizzata — cards_illustrator_idx,
// gia' usata in produzione da AssetView.jsx/CardPage.jsx). Nessuna nuova tabella.
//
// Slug deterministico: stessa regola gia' validata per i Set (src/lib/setSlug.js) —
// lowercase + qualunque sequenza di caratteri non alfanumerici -> "-", trim dei "-"
// iniziali/finali. Riusare la stessa regola non e' un vincolo tecnico ma una scelta
// di coerenza: zero nuove convenzioni di slug nel progetto.
//
// L'entita' Illustrator e' GLOBALE, non scoped per tcg (a differenza di /set/:slug).
// Motivo verificato su Supabase: cards.illustrator oggi e' popolato solo per
// tcg='pokemon' (33.606/154.017 righe, 418 valori distinti; onepiece/mtg/ygo hanno
// 0 righe con illustrator valorizzato), ma un illustratore non e' concettualmente
// legato a un solo tcg — niente prefisso tcg nello slug/URL.
export function slugifyIllustrator(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
