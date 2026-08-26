// lib/http.mjs
// Rate-limited fetch with retry/backoff for pokemon-card.com (and similar single-host sources).
// Read-only. Never mutates remote state. Designed to be gentle: default 1 req/sec, capped retries.

export function createRateLimiter({ minIntervalMs = 1000 } = {}) {
  let lastCallAt = 0
  return async function wait() {
    const now = Date.now()
    const elapsed = now - lastCallAt
    if (elapsed < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - elapsed))
    }
    lastCallAt = Date.now()
  }
}

// fetchWithRetry: GET only, follows redirects (fetch default), classifies transient vs permanent errors.
// opts.fetchImpl is injectable for tests (never call the real network from a unit test).
export async function fetchWithRetry(url, opts = {}) {
  const {
    fetchImpl = fetch,
    maxRetries = 3,
    timeoutMs = 15000,
    userAgent = 'DraGold-CatalogBot/0.1 (+read-only research prototype; contact: er.malali91@gmail.com)',
    limiter = null,
  } = opts

  let lastErr = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (limiter) await limiter()
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': userAgent },
        redirect: 'follow',
        signal: controller.signal,
      })
      clearTimeout(t)
      // 429/5xx are transient -> retry with backoff. Everything else returns immediately.
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`transient HTTP ${res.status}`)
        await backoff(attempt)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(t)
      lastErr = err
      await backoff(attempt)
    }
  }
  throw lastErr || new Error('fetchWithRetry: exhausted retries')
}

function backoff(attempt) {
  const ms = Math.min(8000, 250 * 2 ** attempt) + Math.floor(Math.random() * 200)
  return new Promise((r) => setTimeout(r, ms))
}
