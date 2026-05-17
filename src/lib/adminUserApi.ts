import { supabase } from './supabase'

export interface AdminUserUpdates {
  email?: string
  password?: string
  fullName?: string | null
  role?: 'user' | 'admin'
  status?: 'pending' | 'approved' | 'rejected'
}

/**
 * Met à jour un compte utilisateur via la Edge Function admin-update-user.
 * Gère : email, mot de passe (auth.users) + nom, rôle, statut (profiles).
 */
export async function adminUpdateUser(
  userId: string,
  updates: AdminUserUpdates,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    error?: string
  }>('admin-update-user', {
    body: {
      userId,
      email:    updates.email,
      password: updates.password,
      fullName: updates.fullName,
      role:     updates.role,
      status:   updates.status,
    },
  })

  if (error) {
    let message = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const body = (await ctx.json()) as { error?: string }
        if (body.error) message = body.error
      }
    } catch { /* garder le message original */ }
    throw new Error(message)
  }

  if (!data?.success) throw new Error(data?.error ?? 'Erreur inconnue')
}
