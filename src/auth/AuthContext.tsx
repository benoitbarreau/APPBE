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
  last_sign_in_at?: string | null
}

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  /** true pendant le chargement initial ET pendant tout fetch de profil */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/** Fetch le profil avec jusqu'à 3 tentatives */
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

  // loading = true tant que :
  //   1. le chargement initial Supabase n'est pas terminé, OU
  //   2. un fetch de profil est en cours (même après reconnexion)
  // On fusionne les deux en un seul état pour simplifier ProtectedRoute.
  const [loading, setLoading] = useState(true)

  // Compteur de fetches en cours — permet de gérer les appels simultanés
  const fetchCount = useRef(0)
  // UserId pour lequel le profil a déjà été chargé avec succès
  const profileFetchedFor = useRef<string | null>(null)
  // Timeout de sécurité (10 s)
  const safetyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Active loading si ce n'est pas déjà en cours */
  const startLoading = () => setLoading(true)

  /** Désactive loading uniquement si aucun fetch n'est en cours */
  const stopLoading = () => {
    fetchCount.current -= 1
    if (fetchCount.current <= 0) {
      fetchCount.current = 0
      setLoading(false)
    }
  }

  const loadProfile = async (userId: string) => {
    // Déjà chargé avec succès pour cet utilisateur → ne pas refetcher
    if (profileFetchedFor.current === userId) return

    fetchCount.current += 1
    startLoading()
    try {
      const prof = await fetchProfileWithRetry(userId)
      setProfile(prof)
      if (prof) profileFetchedFor.current = userId
    } finally {
      stopLoading()
    }
  }

  useEffect(() => {
    // Filet de sécurité : sortir du loading après 10 s dans tous les cas
    safetyTimeout.current = setTimeout(() => {
      fetchCount.current = 0
      setLoading(false)
    }, 10_000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (safetyTimeout.current) {
          clearTimeout(safetyTimeout.current)
          safetyTimeout.current = null
        }

        const currentUser = session?.user ?? null
        setUser(currentUser)

        if (currentUser) {
          await loadProfile(currentUser.id)
        } else {
          setProfile(null)
          profileFetchedFor.current = null
          setLoading(false)
        }
      }
    )

    return () => {
      if (safetyTimeout.current) clearTimeout(safetyTimeout.current)
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
    setUser(null)
    setProfile(null)
    profileFetchedFor.current = null
    fetchCount.current = 0
    // Vider les clés de session Supabase
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
    try {
      await supabase.auth.signOut()
    } catch {
      // Erreurs réseau ignorées — l'état local est déjà vidé
    }
  }

  /** Recharge le profil (utile après modification du compte) */
  const refreshProfile = async () => {
    if (!user) return
    profileFetchedFor.current = null
    await loadProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
