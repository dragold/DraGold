// DraGold - Card Page data layer (Fase 2)
// Query isolate per la pagina pubblica /carta/{slug}. Nessuna logica UI qui.
import { supabase } from '../../supabase.js'

  export async function getCardPageData(slug) {
if (!supabase || !slug) return null

  const { data: canonical, error: canonicalErr } = await supabase
.from('canonical_cards')
  .select('*')
  .eq('slug', slug)
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
  variants: allVariants,
  languages,
  rarity: rarityRow || null,
  currentPrice,
  priceHistory,
  sameSetCards,
}
  }
