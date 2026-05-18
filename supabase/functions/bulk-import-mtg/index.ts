// DraGold: Bulk import Magic: The Gathering from Scryfall bulk data
// Strategy: download daily "all_cards" JSON (~2.34 GB for ALL languages, ~514 MB EN only).
// Edge Function memory is limited (256 MB), so we stream-parse with chunked fetching.
// For free tier, we import EN-only first; user can re-run for other languages later.
//
// NOTE: Scryfall bulk data URLs are listed here: https://api.scryfall.com/bulk-data
// We use "default_cards" which is ~340 MB (one card per language printing).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient, loggedFetch } from '../_shared/fetch-with-log.ts'

serve(async (req) => {
  const supabase = getServiceClient()
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const langFilter: string[] | null = body.langs || null  // null = all languages

  // 1) Get the bulk data manifest
  const manifest = await loggedFetch(supabase, 'scryfall',
    'https://api.scryfall.com/bulk-data', { timeout: 15000 })
  if (!manifest.ok) {
    return new Response(JSON.stringify({ error: 'manifest fetch failed', detail: manifest.error }), { status: 500 })
  }

  // We want "default_cards" (more manageable size, has prices)
  const bulkEntry = manifest.data.data.find((b: any) => b.type === 'default_cards')
  if (!bulkEntry) {
    return new Response(JSON.stringify({ error: 'no default_cards bulk' }), { status: 500 })
  }

  // 2) Download the JSON. CAUTION: this can be 340+ MB.
  //    Supabase Edge Function memory: 256 MB. We process in streaming fashion.
  const downloadStart = Date.now()
  const res = await fetch(bulkEntry.download_uri)
  if (!res.ok || !res.body) {
    return new Response(JSON.stringify({ error: 'bulk download failed' }), { status: 500 })
  }

  // Parse the JSON array incrementally (it's a top-level array).
  // We accumulate in a buffer, find complete card objects via brace counting.
  const decoder = new TextDecoder()
  const reader = res.body.getReader()
  let buffer = ''
  let imported = 0
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1
  let batch: any[] = []

  async function flushBatch() {
    if (batch.length === 0) return
    const rows = batch.map((c) => ({
      id: `mtg:scryfall:${c.id}:${c.lang || 'en'}`,
      tcg: 'mtg',
      source: 'scryfall',
      source_id: c.id,
      lang: c.lang || 'en',
      name: c.name || c.printed_name || '',
      set_id: c.set || null,
      set_name: c.set_name || null,
      card_number: c.collector_number || null,
      rarity: c.rarity || null,
      supertype: c.type_line || null,
      image_url: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
      image_url_hi: c.image_uris?.large || c.card_faces?.[0]?.image_uris?.large || null,
      metadata: {
        prices: c.prices,
        oracle_id: c.oracle_id,
        set_type: c.set_type,
      },
      updated_at: new Date().toISOString(),
    })).filter(r =>
      r.image_url && (!langFilter || langFilter.includes(r.lang))
    )
    if (rows.length === 0) { batch = []; return }
    const { error } = await supabase.from('cards').upsert(rows, { onConflict: 'id' })
    if (!error) imported += rows.length

    // Also snapshot the EN/USD prices for alert-eligible cards
    const priceRows: any[] = []
    batch.forEach((c) => {
      if (c.prices?.usd) {
        priceRows.push({
          card_id: `mtg:scryfall:${c.id}:${c.lang || 'en'}`,
          source: 'scryfall',
          currency: 'USD',
          price_market: parseFloat(c.prices.usd) || null,
          raw_response: c.prices,
        })
      }
    })
    if (priceRows.length) {
      await supabase.from('card_prices').insert(priceRows)
    }
    batch = []
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // Parse all complete top-level objects in buffer
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') {
        if (depth === 0) objStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && objStart >= 0) {
          const obj = buffer.slice(objStart, i + 1)
          try {
            const card = JSON.parse(obj)
            batch.push(card)
            if (batch.length >= 500) await flushBatch()
          } catch (_) {}
          objStart = -1
        }
      }
    }
    // Trim buffer to keep only the unparsed remainder
    if (objStart === -1) buffer = '' // safe to discard
    else { buffer = buffer.slice(objStart); objStart = 0 }
  }
  await flushBatch()

  return new Response(JSON.stringify({
    ok: true,
    bulk_size_mb: Math.round(bulkEntry.size / 1024 / 1024),
    imported,
    duration_ms: Date.now() - downloadStart,
  }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
