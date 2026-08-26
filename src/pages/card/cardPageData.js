// DraGold - Card Page data layer (Fase 2)
// Query isolate per la pagina pubblica /carta/{slug}. Nessuna logica UI qui.
import { supabase } from '../../supabase.js'

  export async function getCardPageData(slug, lang) {
if (!supabase || !slug) return null

  // NOTE (Block 4 - SEO Foundation, 18/08/2026): verificato su Supabase che
  // slug non e' garantito univoco (280 gruppi duplicati, 560 righe, es.
  // 'pokemon-sv10-074' causato da un mismatch di case su set_id 'sv10' vs
  // 'SV10'). Senza un ORDER BY deterministico, un .limit(1) puo' restituire
  // una riga arbitraria ad ogni richiesta -> stessa URL che serve contenuti
  // diversi a run diversi (rischio SEO reale: Google indicizza uno snapshot
  // instabile). Verificato anche che created_at da solo NON basta come
  // tiebreaker: le righe duplicate condividono lo stesso created_at
  // (inserite nello stesso batch), quindi si ordina anche per id (stabile,
  // univoco) come secondo criterio, cosi' la riga scelta e' sempre la stessa
  // finche' il bug di dati a monte (slug duplicati) non viene risolto
  // separatamente (nessuna modifica DB in questo task).
  //
  // E2E fix (preview 09585cc, bug #1/#2): tra le righe duplicate rientra un
  // caso reale verificato su Supabase — due canonical_cards distinti con lo
  // STESSO slug "pokemon-sv10-001": un gruppo EN/DE/ES/FR/IT/PT (card_number
  // "001", fonte tcgdex) e un gruppo giapponese-only completamente diverso
  // (stesso card_number, canonical_card_id diverso). L'ORDER BY sopra sceglie
  // sempre la stessa riga, ma "sempre la stessa" non vuol dire "quella giusta"
  // quando chi ha cliccato il link veniva da un contesto con lingua nota (es.
  // Set Detail Giapponese ?lang=ja, o Set Detail EN). Quando il chiamante
  // passa `lang` (letto da CardPage.jsx dal query param ?lang= sull'URL, se
  // presente — stesso pattern gia' usato da SetPage.jsx), e la slug richiesta
  // risulta ambigua (>1 canonical_cards match), si preferisce il gruppo che
  // ha realmente una riga `cards` in quella lingua — dato reale, nessun
  // matching euristico su nome/somiglianza. Se `lang` e' assente o nessuno
  // dei gruppi ambigui ha quella lingua, il comportamento resta quello di
  // sempre (primo per created_at/id).
  const { data: matches, error: canonicalErr } = await supabase
.from('canonical_cards')
  .select('*')
  .eq('slug', slug)
  .order('created_at', { ascending: true })
  .order('id', { ascending: true })

  if (canonicalErr || !matches || !matches.length) return null

  let canonical = matches[0]
  if (matches.length > 1) {
    // E2E fix (verification gate, commit 9d393a8 follow-up): il ramo sopra
    // disambiguava SOLO quando l'URL portava ?lang= esplicito. Senza lang,
    // si cadeva sempre su matches[0] (ordinato per created_at/id) — per
    // ~280 slug duplicati questo sceglie in modo arbitrario e non
    // deterministico-per-l'utente quale dei due gruppi (es. EN/DE/ES/FR/IT/PT
    // vs JA-only) mostrare, perche' l'ordinamento e' sull'id (stringa) e non
    // ha alcuna relazione con quale gruppo sia "quello di default" per un
    // utente che apre lo slug nudo. Fix generico (nessuno slug hardcoded):
    // 1) se e' presente ?lang= ed esiste un gruppo con quella lingua, vince
    //    quel gruppo (comportamento invariato);
    // 2) altrimenti, regola di default deterministica per tutto il catalogo:
    //    preferisci il gruppo che ha davvero una riga in lingua 'en' — e' la
    //    lingua di riferimento del catalogo (fallback gia' usato altrove in
    //    questo stesso file per displayName/primary);
    // 3) se nessun gruppo ha 'en' (es. duplicati veri, stesso lang su righe
    //    diverse), si ricade sul comportamento originale (matches[0]).
    const { data: langRows } = await supabase
      .from('cards')
      .select('canonical_card_id, lang')
      .in('canonical_card_id', matches.map(m => m.id))
    const byLang = (l) => langRows?.length
      ? matches.find(m => langRows.some(r => r.canonical_card_id === m.id && r.lang === l))
      : null
    const disambiguated = (lang && byLang(lang)) || byLang('en')
    if (disambiguated) canonical = disambiguated
  }

  const { data: variants } = await supabase
.from('cards')
  .select('id, tcg, name, set_id, set_name, card_number, rarity, image_url, image_url_hi, lang, print_variant, illustrator, evolves_from, series_id, series_name')
  .eq('canonical_card_id', canonical.id)

  const allVariants = variants || []
  if (!allVariants.length) return null

  // E2E fix (bug #2): quando la richiesta porta un lang esplicito (Card
  // aperta da un link Set Detail con ?lang=ja/altro), e quel gruppo canonico
  // ha davvero una stampa in quella lingua, la card si apre direttamente su
  // quella stampa invece di ripiegare sempre su English — la lingua da cui
  // l'utente e' arrivato non deve sparire al primo render. curated
  // (primary_image_card_id) resta la priorita' piu' alta quando esiste ed e'
  // gia' nella lingua giusta; altrimenti si preferisce lang, poi English,
  // poi la prima riga disponibile — comportamento originale invariato quando
  // lang e' assente.
  const curated = allVariants.find(c => c.id === canonical.primary_image_card_id)
  const primary = (curated && (!lang || curated.lang === lang) ? curated : null)
  || (lang && allVariants.find(c => c.lang === lang))
  || curated
  || allVariants.find(c => c.lang === 'en')
  || allVariants[0]

  const languages = [...new Set(allVariants.map(c => c.lang))].sort()

    const enVariant = allVariants.find(c => c.lang === 'en')
    const langLabels = { ja: 'Japanese', en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ko: 'Korean', zh: 'Chinese' }
    const tcgLabels = { pokemon: 'Pokémon', mtg: 'Magic: The Gathering', ygo: 'Yu-Gi-Oh!', onepiece: 'One Piece' }
    const displayName = (enVariant && enVariant.name) || `${langLabels[primary.lang] || (primary.lang || '').toUpperCase()} ${tcgLabels[primary.tcg] || primary.tcg} Card ${primary.card_number || ''}`.trim()
    const displaySetName = (enVariant && enVariant.set_name) || (primary.lang === 'en' ? primary.set_name : null) || primary.set_id || primary.set_name

  // Market/Purchase Discovery MVP (2026-08-25): eBay sold-average timeframes
  // (source='ebay_finding', stessa tabella card_prices, stesso filtro già
  // usato da AssetView.jsx loadSoldData — nessuna nuova tabella/API, solo
  // riuso dello stesso pattern qui nel data layer server-side). Interrogata
  // separatamente dallo storico prezzi generico sopra (che non filtra per
  // source) perché limit(60) su tutte le fonti non garantirebbe di includere
  // le righe ebay_finding più recenti per ogni finestra se altre fonti
  // scrivono più spesso — stesso motivo per cui AssetView la tiene distinta.
  const [{ data: prices }, { data: rarityRow }, { data: sameSet }, { data: soldRows }] = await Promise.all([
supabase
.from('card_prices')
.select('source, currency, price_market, price_low, price_high, price_median, captured_at, timeframe')
.eq('card_id', primary.id)
.order('captured_at', { ascending: false })
.limit(60),
primary.rarity
? supabase.from('rarities').select('slug, label_en, tier').eq('tcg', primary.tcg).eq('raw_value', primary.rarity).maybeSingle()
: Promise.resolve({ data: null }),
supabase
.from('cards')
.select('id, name, card_number, image_url, canonical_card_id')
.eq('tcg', primary.tcg)
.eq('set_id', primary.set_id)
.eq('lang', primary.lang)
.neq('id', primary.id)
.limit(12),
supabase
.from('card_prices')
.select('price_market, price_median, timeframe, currency, captured_at, raw_response')
.eq('card_id', primary.id)
.eq('source', 'ebay_finding')
.not('timeframe', 'is', null)
.order('captured_at', { ascending: false })
.limit(30),
])

const priceHistory = prices || []
const currentPrice = priceHistory[0] || null

// Solo la riga più recente per finestra (7d/30d/90d) — stessa riduzione di
// AssetView.jsx loadSoldData, count reale estratto da raw_response quando
// presente, mai inventato.
const soldByTimeframe = {}
for (const row of (soldRows || [])) {
  if (!soldByTimeframe[row.timeframe]) {
    soldByTimeframe[row.timeframe] = { ...row, count: row.raw_response?.count ?? null }
  }
}


let sameSetCards = sameSet || []
  if (sameSetCards.length) {
    const ccIds = [...new Set(sameSetCards.map(c => c.canonical_card_id).filter(Boolean))]
    if (ccIds.length) {
      const { data: ccRows } = await supabase.from('canonical_cards').select('id, slug').in('id', ccIds)
      const slugMap = new Map((ccRows || []).map(r => [r.id, r.slug]))
      sameSetCards = sameSetCards.map(c => ({ ...c, slug: c.canonical_card_id ? slugMap.get(c.canonical_card_id) : null }))
    }
  }

return {
  canonical,
  primary,
  displayName,
  displaySetName,
  variants: allVariants,
  languages,
  rarity: rarityRow || null,
  currentPrice,
  priceHistory,
  soldByTimeframe,
  sameSetCards,
}
  }
