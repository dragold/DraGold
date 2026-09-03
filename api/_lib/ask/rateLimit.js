// Ask DraGold — minimal rate limiter for /api/ask. No external service.
//
// Three windows, all 60s:
//   GLOBAL      — total /api/ask calls across everyone. Protects Ollama / cost
//                 from a runaway loop anywhere. Durable: counts agent_queries.
//   PER_USER    — a signed-in user's own calls. Durable: counts agent_queries
//                 by the verified user_id.
//   PER_IP      — anonymous callers, keyed by client IP. Best-effort in-memory
//                 (resets on cold start / per instance) — a coarse guard against
//                 a single anonymous client hammering a warm instance.
//
// Tune via env: ASK_RL_GLOBAL, ASK_RL_USER, ASK_RL_IP, ASK_RL_WINDOW_S.

const WINDOW_S = int(process.env.ASK_RL_WINDOW_S, 60);
const LIMITS = {
  global: int(process.env.ASK_RL_GLOBAL, 30),
  user: int(process.env.ASK_RL_USER, 8),
  ip: int(process.env.ASK_RL_IP, 5),
};

function int(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; }

// in-memory fixed-window buckets for anonymous IPs: ip -> { count, resetAt }
const ipBuckets = new Map();

export function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function checkIp(ip) {
  const now = Date.now();
  let b = ipBuckets.get(ip);
  if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + WINDOW_S * 1000 }; ipBuckets.set(ip, b); }
  b.count++;
  // opportunistic cleanup
  if (ipBuckets.size > 5000) for (const [k, v] of ipBuckets) if (v.resetAt <= now) ipBuckets.delete(k);
  return { ok: b.count <= LIMITS.ip, retryAfter: Math.ceil((b.resetAt - now) / 1000), limit: LIMITS.ip };
}

/**
 * @param {object} sb service-role client (for the durable counts)
 * @param {object} p  { ip, userId }
 * @returns {Promise<{ ok: boolean, reason?: string, retryAfter?: number, limit?: number, window_s: number }>}
 */
export async function checkRateLimit(sb, { ip, userId }) {
  const sinceIso = new Date(Date.now() - WINDOW_S * 1000).toISOString();

  // GLOBAL
  try {
    const { count } = await sb.from('agent_queries')
      .select('id', { count: 'exact', head: true }).gte('created_at', sinceIso);
    if (count != null && count >= LIMITS.global) {
      return { ok: false, reason: 'global', retryAfter: WINDOW_S, limit: LIMITS.global, window_s: WINDOW_S };
    }
  } catch { /* if the count fails, don't hard-block on the global rule */ }

  if (userId) {
    // PER_USER (durable)
    try {
      const { count } = await sb.from('agent_queries')
        .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sinceIso);
      if (count != null && count >= LIMITS.user) {
        return { ok: false, reason: 'user', retryAfter: WINDOW_S, limit: LIMITS.user, window_s: WINDOW_S };
      }
    } catch { /* fall through */ }
    return { ok: true, window_s: WINDOW_S };
  }

  // PER_IP (anonymous, best-effort in-memory)
  const r = checkIp(ip);
  if (!r.ok) return { ok: false, reason: 'ip', retryAfter: r.retryAfter, limit: r.limit, window_s: WINDOW_S };
  return { ok: true, window_s: WINDOW_S };
}

// test hook
export function _resetIpBuckets() { ipBuckets.clear(); }
export const _LIMITS = LIMITS;
export const _WINDOW_S = WINDOW_S;
