// DraGold: Bulk import One Piece TCG from Scrydex
// Scrydex API: https://docs.scrydex.com - GET /v1/onepiece/cards
// Free tier: 1000 req/month (we need ~1 request per page, ~10 pages total)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch } from '../_shared/fetch-with-log.ts'

serve(async (_req) => {
  const supabase = getServiceClient()
  const apiKey = Deno.env.get('SCRYDEX_API_KEY')

  if (!apiKey) {
    return new Response(JSON.stringify({
      error: 'SCRYDEX_API_KEY secret missing on Supabase',
      hint: 'Sign up at scrydex.com (free), then add secret on Supabase Dashboard'
    }), { status: 400 })
  }

  let page = 1
  let totalImported = 0
  const errors: any[] = []

  while (true) {
    const res = await loggedFetch(supabase, 'scrydex',
      `https://api.scrydex.com/v1/onepiece/cards?page=${page}&page_size=100`,
      {
        timeout: 30000,
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
    if (!res.ok) {
      errors.push({ page, error: res.error })
      break
    }
    const items = res.data?.data || []
    if (items.length === 0) break

    const chunk = items.map((c: any) => ({
      id: `onepiece:scrydex:${c.id}:en`,
      tcg: 'onepiece',
      source: 'scrydex',
      source_id: c.id,
      lang: 'en',
      name: c.name || '',
      set_id: c.set?.id || null,
      set_name: c.set?.name || null,
      card_number: c.number || c.collector_number || null,
      rarity: c.rarity || null,
      supertype: c.type || 'Character',
      image_url: c.image?.small || c.images?.[0]?.small || null,
      image_url_hi: c.image?.large || c.images?.[0]?.large || null,
      metadata: c,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('cards').upsert(chunk, { onConflict: 'id' })
    if (!error) totalImported += chunk.length

    if (items.length < 100) break  // last page
    page++
    if (page > 50) break  // safety cap
  }

  return new Response(JSON.stringify({ ok: true, imported: totalImported, pages: page, errors }, null, 2),
    { headers: { 'Content-Type': 'application/json' } })
})
