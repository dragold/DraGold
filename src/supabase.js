// DraGold backend: Supabase client + auth + alerts helpers
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = URL && KEY ? createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null

export const supabaseReady = !!supabase

// ---- Auth ----
export async function sendMagicLink(email) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin, data: { app_name: 'DraGold' } }
  })
}
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}
export function onAuth(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session))
  return () => data.subscription.unsubscribe()
}
export async function signOut() { return supabase?.auth.signOut() }

// ---- Alerts (real DB-backed, not just UI) ----
export async function listAlerts() {
  if (!supabase) return []
  const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false })
  return data || []
}
export async function createAlert({ tcg, cardId, cardName, language='en', threshold, targetEur, direction='below', currency='USD', country='IT' }) {
  if (!supabase) return { error: 'Backend not configured' }
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return { error: 'Not signed in' }
  return supabase.from('alerts').insert({
    user_id: userId,
    tcg, card_api_id: cardId, card_name: cardName, language,
    threshold_price: threshold, target_eur: targetEur ?? threshold,
    email: u?.user?.email,
    direction, currency, country,
    region: ['IT','DE','FR','ES','PT','NL','BE','AT','PL','SE','FI','DK','GR'].includes(country) ? 'EU' : country,
  })
}
export async function deleteAlert(id) {
  if (!supabase) return
  return supabase.from('alerts').delete().eq('id', id)
}

// ---- Card lookup (by cards.id) ----
// Used for direct navigation to /card/{id} (temporary internal deep-link route,
// see DraGold.jsx — NOT the canonical SEO url, that remains /carta/{slug}).
export async function getCardById(id) {
  if (!supabase || !id) return null
  const { data } = await supabase.from('cards')
    .select('id,name,name_en,set_name,set_id,card_number,image_url,image_url_hi,lang,tcg,rarity,canonical_card_id,card_image_cache(cached_url,status)')
    .eq('id', id)
    .maybeSingle()
  return data || null
}

// ---- Collection / Watchlist ----
export async function listCollection() {
  if (!supabase) return []
  const { data } = await supabase.from('collection').select('*').order('added_at', { ascending: false })
  return data || []
}
export async function addToCollection(card) {
  if (!supabase) return { error: 'Backend not configured' }
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return { error: 'Not signed in' }
  // onConflict su (user_id, card_api_id): aggiorna se la carta è già in collezione
  return supabase.from('collection').upsert(
    { user_id: userId, ...card },
    { onConflict: 'user_id,card_api_id' }
  )
}
export async function removeFromCollection(id) {
  if (!supabase) return
  return supabase.from('collection').delete().eq('id', id)
}

// Decrement-or-remove atomico, gemella di addOrIncrementCollection: stessa
// RPC pattern (nessun SELECT->-1 in JS). quantity>1 -> decrementa di 1 e la
// riga resta; quantity===1 -> la riga viene eliminata (out_deleted=true,
// quantity torna 0 per la UI). Usata da AssetView e Collection cosi' il
// bottone "-" ha lo stesso comportamento ovunque.
export async function decrementOrRemoveCollection(cardApiId) {
  if (!supabase) return { error: 'Backend not configured' }
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return { error: 'Not signed in' }
  const { data, error } = await supabase.rpc('decrement_or_remove_collection', {
    p_card_api_id: cardApiId,
  })
  if (error) return { error }
  const row = Array.isArray(data) ? data[0] : data
  return { data: row }
}

// Add-or-increment atomico via RPC (Block Quantity, 18/08/2026): un upsert
// supabase-js semplice non puo' esprimere "quantity = quantity + 1" lato server,
// quindi la RPC add_or_increment_collection (migration applicata su Supabase)
// fa insert-or-update in una singola query atomica, senza SELECT->+1 in JS.
// Ritorna out_inserted=true se e' una riga nuova (prima copia), false se era
// gia' in collezione (quantity incrementata) — usato per il feedback UI.
export async function addOrIncrementCollection(card) {
  if (!supabase) return { error: 'Backend not configured' }
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return { error: 'Not signed in' }
  const { data, error } = await supabase.rpc('add_or_increment_collection', {
    p_card_api_id: card.card_api_id,
    p_tcg: card.tcg,
    p_card_name: card.card_name,
    p_set_name: card.set_name,
    p_image_url: card.image_url,
    p_card_number: card.card_number ?? null,
    p_rarity: card.rarity ?? null,
    p_language: card.language ?? null,
  })
  if (error) return { error }
  const row = Array.isArray(data) ? data[0] : data
  return { data: row }
}

// ---- Watchlist (tracked cards → included in future price refreshes) ----
// Live schema (proven in prod): user_id, card_api_id, tcg, card_name, set_name, image_url.
// card_api_id is cards.id WITHOUT the leading "<tcg>:" prefix, so refresh-prices can
// reconstruct ${tcg}:${card_api_id} === card_prices.card_id (= cards.id).
export async function listWatchlist() {
  if (!supabase) return []
  const { data } = await supabase.from('watchlist').select('*').order('added_at', { ascending: false })
  return data || []
}
export async function addToWatchlist({ tcg, cardApiId, cardName, setName = '', imageUrl = null }) {
  if (!supabase) return { error: 'Backend not configured' }
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return { error: 'Not signed in' }
  return supabase.from('watchlist').upsert({
    user_id: userId, card_api_id: cardApiId, tcg,
    card_name: cardName, set_name: setName, image_url: imageUrl,
  }, { onConflict: 'user_id,card_api_id' })
}
export async function removeFromWatchlist(cardApiId) {
  if (!supabase) return
  const { data: u } = await supabase.auth.getUser()
  const userId = u?.user?.id
  if (!userId) return
  return supabase.from('watchlist').delete().eq('user_id', userId).eq('card_api_id', cardApiId)
}

// ---- Newsletter ----
export async function subscribeNewsletter(email) {
  if (!supabase) return
  return supabase.from('newsletter').insert({ email, source: 'landing' })
}

// ════════════════════════════════════════════════════════════════════════
// AUTH — email/password + Google OAuth + username + password reset
// (Auth/Profile/Username feature — extends the magic-link auth above,
// does not replace it: sendMagicLink/getSession/onAuth/signOut stay as-is.)
// ════════════════════════════════════════════════════════════════════════

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export function validateUsername(u) {
  const v = (u || '').trim()
  if (!v) return 'Username is required.'
  if (!USERNAME_RE.test(v)) return 'Username must be 3–20 characters: letters, numbers and underscore only.'
  return null
}

export function validatePassword(p) {
  if (!p || p.length < 6) return 'Password must be at least 6 characters.'
  return null
}

// Best-effort availability check (also enforced server-side by the unique
// index on lower(username) + profiles_username_format — this is UX only,
// a race at signup time still fails safely with a normalized error).
export async function isUsernameAvailable(username) {
  if (!supabase || !username) return true
  const { data, error } = await supabase.from('profiles').select('id').ilike('username', username).maybeSingle()
  if (error) return true
  return !data
}

export async function signUpWithPassword({ email, password, username }) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })
}

export async function signInWithPassword({ email, password }) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.signInWithPassword({ email, password })
}

// Requires Google OAuth to be configured in the Supabase dashboard
// (Authentication → Providers → Google) — see final report for manual steps.
export async function signInWithGoogle(redirectPath = '/') {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${redirectPath}` },
  })
}

export async function sendPasswordReset(email) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
}

export async function updatePassword(newPassword) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.updateUser({ password: newPassword })
}

export async function resendVerificationEmail(email) {
  if (!supabase) return { error: { message: 'Backend not configured' } }
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${window.location.origin}/login` },
  })
}

export async function getProfile(userId) {
  if (!supabase || !userId) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data || null
}

// Normalizes a raw Supabase/Postgres error into a human message. Full
// technical detail always goes to console for debugging.
export function normalizeAuthError(error) {
  const raw = error?.message || (typeof error === 'string' ? error : '') || ''
  const msg = raw.toLowerCase()
  if (error) console.error('[auth]', error)
  if (!raw) return 'Something went wrong. Please try again.'

  if (msg.includes('already registered') || msg.includes('user already exists') ||
      (msg.includes('duplicate') && msg.includes('email')))
    return 'An account with this email already exists. Try signing in instead.'
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials'))
    return 'Incorrect email or password.'
  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed'))
    return 'Please verify your email before signing in — check your inbox.'
  if (msg.includes('profiles_username_lower_idx') || msg.includes('profiles_username_key') ||
      (msg.includes('username') && msg.includes('duplicate')) ||
      (msg.includes('username') && msg.includes('already')))
    return 'This username is already taken.'
  if (msg.includes('profiles_username_format'))
    return 'Username must be 3–20 characters: letters, numbers and underscore only.'
  if (msg.includes('password') && (msg.includes('at least') || msg.includes('should be') || msg.includes('weak') || msg.includes('short')))
    return 'Password is too weak — use at least 6 characters.'
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429'))
    return 'Too many attempts — please wait a moment and try again.'
  if (msg.includes('expired') || msg.includes('invalid or expired') || msg.includes('token has expired'))
    return 'This link has expired. Please request a new one.'
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Network error — check your connection and try again.'
  if (msg.includes('unsupported provider') || msg.includes('provider is not enabled') || msg.includes('oauth'))
    return 'Google sign-in is not available right now. Try email and password instead.'
  if (msg.includes('session') && (msg.includes('expired') || msg.includes('missing')))
    return 'Your session has expired — please sign in again.'
  return raw
}
