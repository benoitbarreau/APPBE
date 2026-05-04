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
    const timeout = setTimeout(finishLoading, 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        try {
          const currentUser = session?.user ?? null
          setUser(currentUser)
          if (currentUser) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUser.id)
              .single()
            setProfile(data as Profile | null)
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
    // Clear local state immediately so UI responds at once
    setUser(null)
    setProfile(null)
    // Clear Supabase session from localStorage before calling signOut
    // to avoid re-auth loops even if the network call fails
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
    try {
      await supabase.auth.signOut()
    } catch {
      // ignore network errors — local state already cleared
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
