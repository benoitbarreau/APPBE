/**
 * Edge Function : admin-update-user
 *
 * Permet à un administrateur de modifier les informations d'un compte utilisateur :
 *   - email       → mis à jour dans auth.users (sans reconfirmation)
 *   - password    → réinitialisation immédiate dans auth.users
 *   - full_name   → mis à jour dans profiles
 *   - role        → mis à jour dans profiles
 *   - status      → mis à jour dans profiles
 *
 * Corps de la requête POST :
 *   {
 *     userId: string,
 *     email?:     string,
 *     password?:  string,
 *     fullName?:  string | null,
 *     role?:      'user' | 'admin',
 *     status?:    'pending' | 'approved' | 'rejected',
 *   }
 *
 * Secrets requis (injectés automatiquement) :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const { userId, email, password, fullName, role, status } = await req.json() as {
      userId?: string
      email?: string
      password?: string
      fullName?: string | null
      role?: 'user' | 'admin'
      status?: 'pending' | 'approved' | 'rejected'
    }

    if (!userId) {
      return json({ error: 'Paramètre manquant : userId est requis' }, 400)
    }
    if (password !== undefined && password.length > 0 && password.length < 6) {
      return json({ error: 'Le mot de passe doit faire au moins 6 caractères' }, 400)
    }

    // ── Client admin (SERVICE_ROLE) ────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Vérifier que l'appelant est admin ──────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Non authentifié' }, 401)

    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !caller) return json({ error: 'Non authentifié' }, 401)

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Accès refusé : réservé aux administrateurs' }, 403)
    }

    // ── Mise à jour auth.users (email et/ou mot de passe) ─────────────
    const authUpdates: Record<string, unknown> = {}
    if (email !== undefined && email.trim() !== '') {
      authUpdates.email = email.trim()
      authUpdates.email_confirm = true // Pas de reconfirmation requise
    }
    if (password !== undefined && password.length >= 6) {
      authUpdates.password = password
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates)
      if (authErr) throw authErr
    }

    // ── Mise à jour profiles ───────────────────────────────────────────
    const profileUpdates: Record<string, unknown> = {}
    if (email !== undefined && email.trim() !== '') profileUpdates.email = email.trim()
    if (fullName !== undefined) profileUpdates.full_name = fullName?.trim() || null
    if (role !== undefined) profileUpdates.role = role
    if (status !== undefined) profileUpdates.status = status

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileErr } = await supabaseAdmin
        .from('profiles').update(profileUpdates).eq('id', userId)
      if (profileErr) throw profileErr
    }

    return json({ success: true })
  } catch (e) {
    console.error('[admin-update-user]', e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
