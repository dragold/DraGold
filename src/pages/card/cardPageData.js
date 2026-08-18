// DraGold - Card Page data layer (Fase 2)
// Query isolate per la pagina pubblica /carta/{slug}. Nessuna logica UI qui.
import { supabase } from '../../supabase.js'

  export async function getCardPageData(slug) {
if (!supabase || !slug) return null

  // NOTE (Block 4 - SEO Foundation, 18/08/2026): verificato su Supabase che
  // slug non e' garantito univoco (280 gruppi duplicati, 560 righe, es.
  // 'pokemon-sv10-074' causato da un mismatch di case su set_id 'sv10' vs
  // 'SV10'). Senza un ORDER BY deterministico, .limit(1) puo' restituire una
  // riga arbitraria ad ogni richiesta -> stessa URL che serve contenuti
  // diversi a run diversi (rischio SEO reale: Google indicizza uno snapshot
  // instabile). Verificato anche che created_at da solo NON basta come
  // tiebreaker: le righe duplicate condividono lo stesso created_at
  // (inserite nello stesso batch), quindi ordino anche per id (stabile,
  // univoco) come secondo criterio, cosi' la riga scelta e' sempre la stessa
  // finche' il bug di dati a monte (slug duplicati) non viene risolto
  // separatamente.
  const { data: canonical, error: canonicalErr } = await supabase
.from('canonical_cards')
  .select('*')
  .eq('slug', slug)
  .order('created_at', { ascending: true })
  .order('id', { ascending: true })
  .limit(1)
  .maybeSingle()

  if (canonicalErr || !canonical) return null

  const { data: variants } = await supabase
.from('cards')
  .select('id, tcg, name, set_id, set_name, card_number, rarity, image_url, image_url_hi, lang, print_variant, illustrator, evolves_from, series_id, series_name')
  .eq('canonical_card_id', canonical.id)

  const allVariants = variants || []
  if (!allVariants.length) return null

  const primary = allVariants.find(c => c.id === canonical.primary_image_card_id)
  || allVariants.find(c => c.lang === 'en')
  || allVariants[0]

  const languages = [...new Set(allVariants.map(c => c.lang))].sort()

    const enVariant = allVariants.find(c => c.lang === 'en')
    const langLabels = { ja: 'Japanese', en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ko: 'Korean', zh: 'Chinese' }
    const tcgLabels = { pokemon: 'Pokémon', mtg: 'Magic: The Gathering', ygo: 'Yu-Gi-Oh!', onepiece: 'One Piece' }
    const displayName = (enVariant && enVariant.name) || `${langLabels[primary.lang] || (primary.lang || '').toUpperCase()} ${tcgLabels[primary.tcg] || primary.tcg} Card ${primary.card_number || ''}`.trim()
    const displaySetName = (enVariant && enVariant.set_name) || (primary.lang === 'en' ? primary.set_name : null) || primary.set_id || primary.set_name

  const [{ data: prices }, { data: rarityRow }, { data: sameSet }] = await Promise.all([
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
])

const priceHistory = prices || []
const currentPrice = priceHistory[0] || null


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
  sameSetCards,
}
  }
