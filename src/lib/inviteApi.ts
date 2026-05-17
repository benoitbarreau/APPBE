import { supabase } from './supabase'

export type InviteMethod = 'invite' | 'password'

export interface InvitePayload {
  email: string
  role: 'user' | 'admin'
  fullName?: string
  method: InviteMethod
  password?: string
}

/**
 * Génère un mot de passe aléatoire de 12 caractères, sans caractères ambigus
 * (0/O, 1/l/I) pour faciliter la lecture et la communication.
 */
export function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#%'
  let pwd = ''
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)]
  }
  return pwd
}

/**
 * Appelle l'Edge Function invite-user pour créer un compte.
 * L'authentification est passée automatiquement par supabase.functions.invoke.
 */
export async function inviteUser(payload: InvitePayload): Promise<{ userId: string }> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    userId: string
    error?: string
  }>('invite-user', { body: payload })

  if (error) {
    // FunctionsHttpError expose le corps de la réponse dans .context
    let message = error.message
    try {
      const ctx = (error as unknown as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const body = (await ctx.json()) as { error?: string }
        if (body.error) message = body.error
      }
    } catch {
      // garder le message original
    }
    throw new Error(message)
  }

  if (!data?.success) throw new Error(data?.error ?? 'Erreur inconnue')
  return { userId: data.userId }
}
