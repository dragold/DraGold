// Shared helper: fetch + log every API call into api_call_log table.
// Use this from every bulk-import / refresh-prices Edge Function so we can monitor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

export async function loggedFetch(
  supabase: ReturnType<typeof getServiceClient>,
  source: string,
  url: string,
  options: RequestInit & { cardId?: string; timeout?: number } = {}
): Promise<{ ok: boolean; data: any; status: number; error?: string }> {
  const { cardId, timeout = 8000, ...fetchOpts } = options as any
  const t0 = Date.now()
  let status = 0
  let error: string | undefined
  let data: any = null
  let ok = false
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    const r = await fetch(url, { ...fetchOpts, signal: controller.signal })
    clearTimeout(id)
    status = r.status
    if (r.ok) {
      data = await r.json().catch(() => null)
      ok = true
    } else {
      error = `HTTP ${r.status}: ${await r.text().catch(() => '')}`.slice(0, 500)
    }
  } catch (e: any) {
    error = e?.message?.slice(0, 500) || 'fetch failed'
  }
  const duration = Date.now() - t0

  // Async log (don't await — fire and forget)
  supabase.from('api_call_log').insert({
    source, endpoint: url.slice(0, 500), status, duration_ms: duration,
    card_id: cardId, error_message: error
  }).then(() => {})

  // Update source health
  if (ok) {
    supabase.from('price_sources').update({
      last_success_at: new Date().toISOString(),
      consecutive_failures: 0,
      monthly_usage: 0  // increment via raw SQL below if needed
    }).eq('id', source).then(() => {})
  } else {
    supabase.rpc('increment_source_failure', { src: source }).then(() => {})
  }

  return { ok, data, status, error }
}

// Try a chain of price sources for a card. Returns the first successful price.
export async function tryPriceChain(
  supabase: ReturnType<typeof getServiceClient>,
  chain: Array<{ source: string; fetcher: () => Promise<{ price: number | null; raw: any }> }>,
  cardId: string
): Promise<{ price: number | null; source: string | null }> {
  for (const link of chain) {
    try {
      const res = await link.fetcher()
      if (res.price != null && res.price > 0) {
        await supabase.from('card_prices').insert({
          card_id: cardId,
          source: link.source,
          currency: 'USD',
          price_market: res.price,
          raw_response: res.raw
        })
        return { price: res.price, source: link.source }
      }
    } catch (_) { /* try next */ }
  }
  return { price: null, source: null }
}
