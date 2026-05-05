import { createContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserStatus = 'pending' | 'approved' | 'rejected'
export type UserRole = 'admin' | 'user'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  status: UserStatus
  role: UserRole
  created_at: string
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/** Fetch le profil avec jusqu'à 3 tentatives (réseau lent, token en cours de refresh) */
async function fetchProfileWithRetry(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error && data) return data as Profile
    if (attempt < 2) await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingDone = useRef(false)
  // Mémorise l'userId pour lequel le profil a déjà été chargé.
  // Permet de savoir si on doit refetcher (TOKEN_REFRESHED après INITIAL_SESSION null).
  const profileFetchedFor = useRef<string | null>(null)

  const finishLoading = () => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
  }

  const loadProfile = async (userId: string) => {
    if (profileFetchedFor.current === userId) return // déjà chargé pour cet utilisateur
    const prof = await fetchProfileWithRetry(userId)
    setProfile(prof)
    if (prof) profileFetchedFor.current = userId
  }

  useEffect(() => {
    // Filet de sécurité : jamais bloqué plus de 10 s sur l'écran de chargement
    const timeout = setTimeout(finishLoading, 10_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          const currentUser = session?.user ?? null
          setUser(currentUser)

          if (currentUser) {
            // Charger le profil si :
            // - connexion explicite (SIGNED_IN)
            // - chargement initial (INITIAL_SESSION)
            // - token rafraîchi MAIS profil pas encore chargé (TOKEN_REFRESHED après session expirée)
            await loadProfile(currentUser.id)
          } else {
            // Pas de session : réinitialiser
            setProfile(null)
            profileFetchedFor.current = null
          }
        } finally {
          clearTimeout(timeout)
          finishLoading()
        }
      }
    )

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
  }

  const signOut = async () => {
    // Réinitialiser immédiatement l'état local
    setUser(null)
    setProfile(null)
    profileFetchedFor.current = null
    // Vider les clés Supabase du localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
    try {
      await supabase.auth.signOut()
    } catch {
      // Erreurs réseau ignorées — l'état local est déjà vidé
    }
  }

  /** Recharge le profil depuis Supabase (utile après modification du compte) */
  const refreshProfile = async () => {
    if (!user) return
    profileFetchedFor.current = null // forcer un nouveau fetch
    await loadProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
