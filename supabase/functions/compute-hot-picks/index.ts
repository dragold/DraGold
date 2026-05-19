// DraGold: Daily computation of hot picks (top movers).
// Schedule: pg_cron, runs once a day (e.g. 03:00 UTC), after refresh-prices.
// Calls the SQL function compute_hot_picks_today() and reports stats.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { getServiceClient } from '../_shared/fetch-with-log.ts'

serve(async (_req) => {
  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('compute_hot_picks_today')
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }
  const { data: picks } = await supabase
    .from('hot_picks')
    .select('rank, card_id, delta_pct, current_price')
    .eq('computed_date', new Date().toISOString().slice(0, 10))
    .order('rank')
  return new Response(JSON.stringify({ ok: true, inserted: data, top: picks?.slice(0, 5) }, null, 2),
    { headers: { 'Content-Type': 'application/json' } })
})
