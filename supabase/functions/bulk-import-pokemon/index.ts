// DraGold: Bulk import Pokémon cards from TCGdex (multi-language)
// Run manually (one-shot) or schedule weekly to catch new sets.
//
// Strategy:
//   1. For each language: GET /v2/{lang}/cards → minimal list (id, localId, name, image)
//   2. Upsert into cards table. Image URL = c.image + "/high.webp"
//   3. Pokemon TCG API metadata (rarity, set, supertype) is fetched separately only for EN
//      then propagated via card mapping (universal IDs).
//
// Invocation: POST https://{project}.supabase.co/functions/v1/bulk-import-pokemon
//   Optional body: { langs: ['en','ja','it'], limit_per_lang: 5000 }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch } from '../_shared/fetch-with-log.ts'

const ALL_LANGS = ['en','ja','ko','fr','de','it','es','pt','zh-tw','zh-cn','id','th']

serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const langs: string[] = body.langs || ALL_LANGS
  const maxPerLang: number = body.limit_per_lang || 50000  // effectively no limit

  const supabase = getServiceClient()
  const stats: Record<string, any> = {}

  for (const lang of langs) {
    const langStart = Date.now()
    const res = await loggedFetch(supabase, 'tcgdex',
      `https://api.tcgdex.net/v2/${lang}/cards`,
      { timeout: 60000 })
    if (!res.ok || !Array.isArray(res.data)) {
      stats[lang] = { error: res.error || 'no data', count: 0 }
      continue
    }
    const cards = (res.data as any[]).slice(0, maxPerLang)
    // Batch insert in chunks of 500
    let imported = 0
    for (let i = 0; i < cards.length; i += 500) {
      const chunk = cards.slice(i, i + 500).map((c) => ({
        id: `pokemon:tcgdex:${c.id}:${lang}`,
        tcg: 'pokemon',
        source: 'tcgdex',
        source_id: c.id,
        lang,
        name: c.name || '',
        set_id: (c.id || '').split('-')[0] || null,
        set_name: null,
        card_number: c.localId || null,
        rarity: null,
        supertype: 'Pokémon',
        image_url: c.image ? `${c.image}/low.webp` : null,
        image_url_hi: c.image ? `${c.image}/high.webp` : null,
        metadata: c,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('cards').upsert(chunk, { onConflict: 'id' })
      if (!error) imported += chunk.length
    }
    stats[lang] = {
      total_from_api: cards.length,
      imported,
      duration_ms: Date.now() - langStart,
    }
  }

  return new Response(JSON.stringify({ ok: true, stats }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  })
})
