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
  /**
   * `loading = initializing || refreshingProfile` — exposé pour la compat avec
   * les composants qui veulent simplement savoir « est-ce qu'on est prêt ? »
   */
  loading: boolean
  /** Erreur fatale survenue pendant le bootstrap (timeout, session corrompue, …). */
  initError: string | null
  /** Force un nouveau bootstrap (utilisé par le bouton « Réessayer »). */
  retry: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Promise.race avec un timeout qui rejette après ms ms. */
function withTimeout<T>(p: Promise<T>, ms: number, label = 'opération'): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout : ${label} > ${ms}ms`)), ms),
    ),
  ])
}

/**
 * Récupère le profil avec jusqu'à 3 tentatives, chacune limitée à 3 s.
 * Pas de blocage indéfini possible : 3 × 3 s + 2 × pause < 8 s max.
 */
async function fetchProfileWithRetry(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // PostgrestBuilder n'est pas une vraie Promise — on l'enrobe via une thunk.
      const { data, error } = await withTimeout(
        Promise.resolve(
          supabase.from('profiles').select('*').eq('id', userId).single(),
        ),
        3000,
        'fetch profile',
      )
      if (!error && data) return data as Profile
      // Erreur "no rows" → vraiment absent, pas la peine de retry
      if (error && (error as { code?: string }).code === 'PGRST116') return null
    } catch (e) {
      // Timeout ou erreur réseau — on retry
      console.warn(`[Auth] fetchProfile attempt ${attempt + 1} failed:`, e)
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  return null
}

/** Nettoie manuellement les clés sb-* au cas où Supabase aurait laissé un état corrompu. */
function clearSupabaseLocalKeys() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    })
  } catch {
    // localStorage indisponible (mode privé) — rien à faire
  }
}

// ─────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────

const BOOTSTRAP_TIMEOUT_MS = 6000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  /** Vrai uniquement pendant la phase de démarrage (lecture session + profil initial). */
  const [initializing, setInitializing] = useState(true)
  /** Vrai pendant un refresh de profil déclenché en runtime (ex. après update). */
  const [refreshingProfile, setRefreshingProfile] = useState(false)
  /** Erreur fatale empêchant le démarrage normal. */
  const [initError, setInitError] = useState<string | null>(null)
  /** Compteur incrémenté pour forcer un nouveau bootstrap. */
  const [retryToken, setRetryToken] = useState(0)

  // UserId pour lequel le profil a déjà été chargé avec succès
  const profileFetchedFor = useRef<string | null>(null)

  const loading = initializing || refreshingProfile

  // ── Bootstrap (au montage et à chaque retry) ──────────────────────
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const bootstrap = async () => {
      setInitializing(true)
      setInitError(null)

      // Filet de sécurité : aucune init ne doit dépasser 6 s.
      timeoutId = setTimeout(() => {
        if (cancelled) return
        console.warn('[Auth] Bootstrap timeout — affichage de l\'écran d\'erreur')
        setInitError(
          "Le démarrage prend trop de temps. Vérifiez votre connexion et réessayez.",
        )
        setInitializing(false)
      }, BOOTSTRAP_TIMEOUT_MS)

      try {
        // 1. Lecture de la session existante (rapide, depuis localStorage)
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          5000,
          'getSession',
        )
        if (cancelled) return

        if (error) {
          // Session corrompue ou jeton invalide → purge et redirection login.
          console.warn('[Auth] getSession a échoué, purge des clés :', error)
          clearSupabaseLocalKeys()
          setUser(null)
          setProfile(null)
          return
        }

        const currentUser = data.session?.user ?? null
        setUser(currentUser)

        // 2. Si connecté, charger le profil (timeouts internes)
        if (currentUser) {
          const prof = await fetchProfileWithRetry(currentUser.id)
          if (cancelled) return
          setProfile(prof)
          if (prof) profileFetchedFor.current = currentUser.id
        } else {
          setProfile(null)
          profileFetchedFor.current = null
        }
      } catch (e) {
        if (cancelled) return
        console.error('[Auth] Bootstrap fatal :', e)
        setInitError(
          "Impossible de démarrer l'application : " +
            (e instanceof Error ? e.message : String(e)),
        )
      } finally {
        if (!cancelled) {
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
          setInitializing(false)
        }
      }
    }

    void bootstrap()

    // ── Listener pour les changements de session en runtime ────────
    // (login, logout, token refresh, expiration). On ignore INITIAL_SESSION
    // car bootstrap() s'en charge déjà — sinon on aurait un double-fetch.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'INITIAL_SESSION') return

      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (currentUser) {
        if (profileFetchedFor.current === currentUser.id) return
        // Lancement non-bloquant : ne JAMAIS await ici, sinon Supabase
        // peut bloquer le traitement des événements suivants (refresh token).
        setRefreshingProfile(true)
        fetchProfileWithRetry(currentUser.id)
          .then((prof) => {
            if (cancelled) return
            setProfile(prof)
            if (prof) profileFetchedFor.current = currentUser.id
          })
          .catch((e) => {
            console.warn('[Auth] refresh profile failed', e)
          })
          .finally(() => {
            if (!cancelled) setRefreshingProfile(false)
          })
      } else {
        setProfile(null)
        profileFetchedFor.current = null
      }
    })

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken])

  // ── Méthodes publiques ────────────────────────────────────────────

  const retry = () => {
    setInitError(null)
    setRetryToken((n) => n + 1)
  }

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
    // Ordre IMPORTANT : on tente d'abord le signOut serveur (qui invalide
    // le token côté Supabase et nettoie proprement le localStorage).
    // Ce n'est qu'en cas d'échec qu'on purge manuellement, pour éviter
    // de laisser des clés cassées qui empêcheraient la prochaine init.
    try {
      await withTimeout(supabase.auth.signOut(), 4000, 'signOut')
    } catch (e) {
      console.warn('[Auth] signOut serveur a échoué, purge locale :', e)
      clearSupabaseLocalKeys()
    }
    // Reset de l'état local — quoi qu'il arrive, l'utilisateur est déconnecté côté UI
    setUser(null)
    setProfile(null)
    profileFetchedFor.current = null
  }

  /** Recharge le profil (utile après modification du compte) */
  const refreshProfile = async () => {
    if (!user) return
    profileFetchedFor.current = null
    setRefreshingProfile(true)
    try {
      const prof = await fetchProfileWithRetry(user.id)
      setProfile(prof)
      if (prof) profileFetchedFor.current = user.id
    } finally {
      setRefreshingProfile(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        initError,
        retry,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
