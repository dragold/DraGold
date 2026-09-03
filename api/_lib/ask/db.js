// Ask DraGold — Supabase clients for the agent.
//   serviceClient()      — service role, for catalogue/market/KG reads + agent_queries writes
//   userClient(jwt)       — the caller's own JWT, for RLS-scoped reads (collection)
import { createClient } from '@supabase/supabase-js';

function url() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const u = url();
  if (!u || !key) throw new Error('Supabase service env missing (SUPABASE_URL + SUPABASE_SERVICE_KEY)');
  return createClient(u, key, { auth: { persistSession: false } });
}

/** A client that acts as the signed-in user (RLS applies). Returns null if no/invalid jwt. */
export function userClient(jwt) {
  if (!jwt) return null;
  const u = url();
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!u || !anon) return null;
  return createClient(u, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/** Best-effort user id from a Supabase access token (unverified decode — only used as a label). */
export function userIdFromJwt(jwt) {
  if (!jwt || jwt.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
    return payload.sub || null;
  } catch { return null; }
}
