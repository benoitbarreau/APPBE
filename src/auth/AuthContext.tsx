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
    // Pause progressive avant la prochaine tentative (700 ms, 1400 ms)
    if (attempt < 2) await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingDone = useRef(false)

  const finishLoading = () => {
    if (!loadingDone.current) {
      loadingDone.current = true
      setLoading(false)
    }
  }

  useEffect(() => {
    // Filet de sécurité : jamais bloqué plus de 10 s sur l'écran de chargement
    const timeout = setTimeout(finishLoading, 10_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          const currentUser = session?.user ?? null
          setUser(currentUser)

          if (currentUser) {
            // Ne re-fetcher le profil que lors du chargement initial ou d'une
            // vraie connexion. TOKEN_REFRESHED ne nécessite pas un nouveau fetch
            // (même utilisateur, même profil) et était la cause des "Profil
            // introuvable" après une sauvegarde de projet.
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
              const prof = await fetchProfileWithRetry(currentUser.id)
              setProfile(prof)
            }
            // Pour TOKEN_REFRESHED / USER_UPDATED : conserver le profil actuel
          } else {
            setProfile(null)
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
  }, [])

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
    setUser(null)
    setProfile(null)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
    try {
      await supabase.auth.signOut()
    } catch {
      // Erreurs réseau ignorées — l'état local est déjà vidé
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
