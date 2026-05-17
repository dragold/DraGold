// DraGold Edge Function: check-alerts
// Runs hourly via cron. Implements 2 cost-saving tricks:
//   1) BATCHING: groups alerts by (tcg, card_api_id) so 50 alerts on Charizard = 1 API call
//   2) CACHE: reuses price_history rows captured in last 30 min to avoid redundant API calls
// Notifies users via Resend (requires RESEND_API_KEY secret)
//
// Deploy:  supabase functions deploy check-alerts
// Schedule via Supabase Dashboard > Database > Cron:  0 * * * *

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LANG_MULT: Record<string, number> = {
  en: 1.00, ja: 1.35, ko: 1.10, fr: 0.72, de: 0.78,
  it: 0.65, es: 0.68, pt: 0.60, zhs: 0.90,
}

async function fetchPriceUSD(tcg: string, cardId: string): Promise<number | null> {
  try {
    if (tcg === 'pokemon') {
      const r = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`)
      if (!r.ok) return null
      const j = await r.json()
      const c = j.data
      return c?.tcgplayer?.prices?.holofoil?.market
          ?? c?.tcgplayer?.prices?.normal?.market
          ?? c?.cardmarket?.prices?.averageSellPrice
          ?? null
    }
    if (tcg === 'mtg') {
      const r = await fetch(`https://api.scryfall.com/cards/${cardId}`)
      if (!r.ok) return null
      const j = await r.json()
      return parseFloat(j?.prices?.usd || '0') || null
    }
    if (tcg === 'ygo') {
      const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${cardId}`)
      if (!r.ok) return null
      const j = await r.json()
      return parseFloat(j?.data?.[0]?.card_prices?.[0]?.cardmarket_price || '0') || null
    }
  } catch (_) {}
  return null
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'DraGold <alerts@dragold.org>',
      to, subject, html,
    }),
  })
}

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ---- 1) Fetch active alerts joined with user email
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*, profiles!inner(email)')
    .eq('is_active', true)

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ checked: 0, triggered: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  // ---- 2) BATCHING: group by (tcg, card_api_id) so each card priced once
  const groups = new Map<string, typeof alerts>()
  for (const a of alerts) {
    const key = `${a.tcg}|${a.card_api_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  }

  let triggered = 0
  const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString()
  const sixHoursAgo = Date.now() - 6 * 60 * 60_000

  for (const [key, batch] of groups.entries()) {
    const [tcg, cardId] = key.split('|')

    // ---- 3) CACHE: reuse recent price_history row if < 30 min old
    let basePrice: number | null = null
    const { data: cached } = await supabase
      .from('price_history')
      .select('fmv_usd')
      .eq('tcg', tcg).eq('card_api_id', cardId)
      .gte('captured_at', thirtyMinAgo)
      .order('captured_at', { ascending: false })
      .limit(1)
    if (cached && cached[0]) {
      basePrice = parseFloat(cached[0].fmv_usd as any)
    } else {
      basePrice = await fetchPriceUSD(tcg, cardId)
      if (basePrice) {
        await supabase.from('price_history').insert({
          tcg, card_api_id: cardId, fmv_usd: basePrice, source: 'live'
        })
      }
    }
    if (!basePrice) continue

    // ---- 4) For each alert in this batch: apply language multiplier and check
    for (const a of batch) {
      const mult = LANG_MULT[(a.language || 'en').toLowerCase()] ?? 1.0
      const current = basePrice * mult * (a.currency === 'EUR' ? 0.92 : 1)
      const fires =
        (a.direction === 'below' && current <= a.threshold_price) ||
        (a.direction === 'above' && current >= a.threshold_price)

      await supabase.from('alerts').update({ last_checked_at: new Date().toISOString() }).eq('id', a.id)

      if (!fires) continue
      const last = a.last_triggered_at ? new Date(a.last_triggered_at).getTime() : 0
      if (last >= sixHoursAgo) continue // throttle 6h

      const sym = a.currency === 'EUR' ? '€' : '$'
      await sendEmail(
        a.profiles.email,
        `[DraGold] ${a.card_name} ${a.direction} ${sym}${a.threshold_price}`,
        `<div style="font-family:sans-serif;max-width:520px">
          <h2 style="color:#fbbf24">${a.card_name}</h2>
          <p>Your <strong>${a.direction}</strong> alert just fired.</p>
          <p>Current price (${(a.language || 'EN').toUpperCase()}): <strong>${sym}${current.toFixed(2)}</strong></p>
          <p>Your threshold: ${sym}${a.threshold_price}</p>
          <p><a href="https://dragold.org" style="color:#fbbf24">Open DraGold →</a></p>
        </div>`
      )
      await supabase.from('alerts').update({ last_triggered_at: new Date().toISOString() }).eq('id', a.id)
      triggered++
    }
  }

  return new Response(JSON.stringify({
    checked: alerts.length,
    batched_cards: groups.size,
    triggered,
    saved_calls: alerts.length - groups.size,
  }), { headers: { 'Content-Type': 'application/json' } })
})
