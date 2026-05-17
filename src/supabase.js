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
    options: { emailRedirectTo: window.location.origin }
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
export async function createAlert({ tcg, cardId, cardName, language='en', threshold, direction='below', currency='EUR', country='IT' }) {
  if (!supabase) return { error: 'Backend not configured' }
  return supabase.from('alerts').insert({
    tcg, card_api_id: cardId, card_name: cardName, language,
    threshold_price: threshold, direction, currency, country,
    region: ['IT','DE','FR','ES','PT','NL','BE','AT','PL','SE','FI','DK','GR'].includes(country) ? 'EU' : country,
  })
}
export async function deleteAlert(id) {
  if (!supabase) return
  return supabase.from('alerts').delete().eq('id', id)
}

// ---- Collection / Watchlist ----
export async function listCollection() {
  if (!supabase) return []
  const { data } = await supabase.from('collection').select('*').order('added_at', { ascending: false })
  return data || []
}
export async function addToCollection(card) {
  if (!supabase) return
  return supabase.from('collection').insert(card)
}
export async function removeFromCollection(id) {
  if (!supabase) return
  return supabase.from('collection').delete().eq('id', id)
}

// ---- Newsletter ----
export async function subscribeNewsletter(email) {
  if (!supabase) return
  return supabase.from('newsletter').insert({ email, source: 'landing' })
}
