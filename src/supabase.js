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
