// Supabase Edge Function: check-alerts
// Runs every hour via cron. Checks all active alerts, compares to current FMV
// adjusted by card language, and notifies users via email (Resend).
//
// Deploy:
//   supabase functions deploy check-alerts
//
// Schedule via Supabase Dashboard > Edge Functions > Schedule:
//   cron: 0 * * * *   (every hour at minute 0)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LANG_MULT: Record<string, number> = {
  EN: 1.00, JP: 1.35, DE: 0.78, FR: 0.72, IT: 0.65, ES: 0.68, PT: 0.60, KO: 1.10, ZH: 0.90,
}

async function fetchPokemonPrice(cardId: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`)
    if (!r.ok) return null
    const j = await r.json()
    const c = j.data
    return c?.cardmarket?.prices?.averageSellPrice
      ?? c?.tcgplayer?.prices?.holofoil?.market
      ?? c?.tcgplayer?.prices?.normal?.market
      ?? null
  } catch { return null }
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'DraGold <alerts@dragold.app>',
      to, subject, html,
    }),
  })
}

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*, profiles(email)')
    .eq('is_active', true)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let triggered = 0
  for (const alert of alerts || []) {
    const basePrice = await fetchPokemonPrice(alert.card_api_id)
    if (!basePrice) continue

    const mult = LANG_MULT[alert.language || 'EN'] ?? 1.0
    const currentPrice = basePrice * mult

    const triggers =
      (alert.direction === 'below' && currentPrice <= alert.threshold_price) ||
      (alert.direction === 'above' && currentPrice >= alert.threshold_price)

    // Update last_checked_at
    await supabase.from('alerts').update({ last_checked_at: new Date().toISOString() }).eq('id', alert.id)

    if (triggers) {
      const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at).getTime() : 0
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
      if (lastTriggered < sixHoursAgo) {
        await sendEmail(
          alert.profiles.email,
          `[DraGold] ${alert.card_name} is now ${currentPrice.toFixed(2)} ${alert.currency}`,
          `<p>Hi,</p>
           <p><strong>${alert.card_name}</strong> (${alert.language || 'EN'}) just hit your alert threshold.</p>
           <p>Current price: <strong>${currentPrice.toFixed(2)} ${alert.currency}</strong><br/>
           Your threshold: ${alert.threshold_price} ${alert.currency} (${alert.direction})</p>
           <p><a href="https://dragold.app/?q=${encodeURIComponent(alert.card_name)}">Open in DraGold</a></p>`
        )
        await supabase.from('alerts').update({ last_triggered_at: new Date().toISOString() }).eq('id', alert.id)
        triggered++
      }
    }
  }

  return new Response(JSON.stringify({ checked: alerts?.length ?? 0, triggered }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
