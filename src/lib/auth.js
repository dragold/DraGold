// Central auth state — Auth/Profile/Username feature (CLAUDE.md §9: shared
// state → lib/, not each component polling Supabase itself).
// AuthProvider wraps every route mounted from main.jsx; components read
// state via useAuth() instead of calling getSession()/onAuth() themselves.
import { createContext, useContext, useState, useEffect, useCallback, createElement as h } from 'react'
import { getSession, onAuth, signOut as sbSignOut, getProfile, supabaseReady } from '../supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  // 'loading' | 'authenticated' | 'unauthenticated'
  const [status, setStatus] = useState('loading')

  const loadProfile = useCallback(async (s) => {
    if (!s?.user) { setProfile(null); return }
    try {
      const p = await getProfile(s.user.id)
      setProfile(p)
    } catch { setProfile(null) }
  }, [])

  useEffect(() => {
    let alive = true
    let off = () => {}
    ;(async () => {
      const s = await getSession()
      if (!alive) return
      setSession(s)
      setStatus(s ? 'authenticated' : 'unauthenticated')
      loadProfile(s)
      off = onAuth((s2) => {
        setSession(s2)
        setStatus(s2 ? 'authenticated' : 'unauthenticated')
        loadProfile(s2)
      })
    })()
    return () => { alive = false; off() }
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session), [session, loadProfile])

  const signOut = useCallback(async () => {
    await sbSignOut()
    setSession(null)
    setProfile(null)
    setStatus('unauthenticated')
  }, [])

  const value = {
    status,
    session,
    user: session?.user || null,
    profile,
    isAuthed: status === 'authenticated',
    refreshProfile,
    signOut,
    supabaseReady,
  }

  return h(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>')
  return ctx
}
