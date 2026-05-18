// DraGold: Bulk import Yu-Gi-Oh! from YGOPRODeck (free, no auth)
// Endpoint: https://db.ygoprodeck.com/api/v7/cardinfo.php (returns ALL cards in one call ~30 MB)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch } from '../_shared/fetch-with-log.ts'

serve(async (_req) => {
  const supabase = getServiceClient()
  const res = await loggedFetch(supabase, 'ygoprodeck',
    'https://db.ygoprodeck.com/api/v7/cardinfo.php',
    { timeout: 60000 })
  if (!res.ok) {
    return new Response(JSON.stringify({ error: res.error }), { status: 500 })
  }
  const cards = res.data?.data || []
  let imported = 0
  let pricesInserted = 0
  for (let i = 0; i < cards.length; i += 500) {
    const chunk = cards.slice(i, i + 500)
    const rows = chunk.map((c: any) => ({
      id: `ygo:ygoprodeck:${c.id}:en`,
      tcg: 'ygo',
      source: 'ygoprodeck',
      source_id: String(c.id),
      lang: 'en',
      name: c.name || '',
      set_id: c.card_sets?.[0]?.set_code?.split('-')[0] || null,
      set_name: c.card_sets?.[0]?.set_name || null,
      card_number: c.card_sets?.[0]?.set_code || null,
      rarity: c.card_sets?.[0]?.set_rarity || null,
      supertype: c.type || 'Monster',
      image_url: c.card_images?.[0]?.image_url_small || null,
      image_url_hi: c.card_images?.[0]?.image_url || null,
      metadata: {
        race: c.race, attribute: c.attribute, archetype: c.archetype,
        sets: c.card_sets,
      },
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' })
    if (!error) imported += rows.length

    // Price snapshot from YGOPRODeck (Cardmarket/TCGPlayer/eBay)
    const priceRows: any[] = []
    chunk.forEach((c: any) => {
      const p = c.card_prices?.[0]
      if (!p) return
      const cardId = `ygo:ygoprodeck:${c.id}:en`
      if (p.cardmarket_price) priceRows.push({
        card_id: cardId, source: 'ygoprodeck', currency: 'EUR',
        price_market: parseFloat(p.cardmarket_price) || null, raw_response: p
      })
      if (p.tcgplayer_price) priceRows.push({
        card_id: cardId, source: 'ygoprodeck', currency: 'USD',
        price_market: parseFloat(p.tcgplayer_price) || null, raw_response: p
      })
    })
    if (priceRows.length) {
      const { error: pe } = await supabase.from('card_prices').insert(priceRows)
      if (!pe) pricesInserted += priceRows.length
    }
  }

  return new Response(JSON.stringify({ ok: true, imported, prices_inserted: pricesInserted }, null, 2),
    { headers: { 'Content-Type': 'application/json' } })
})
