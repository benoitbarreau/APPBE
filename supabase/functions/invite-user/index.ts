/**
 * Edge Function : invite-user
 *
 * Permet à un administrateur de créer un compte utilisateur de deux façons :
 *   - "invite"   → envoie un email d'invitation avec un lien de définition de MDP
 *   - "password" → crée le compte directement avec un mot de passe provisoire
 *
 * Corps de la requête POST :
 *   { email: string, role: "user"|"admin", fullName?: string,
 *     method: "invite"|"password", password?: string }
 *
 * Variables d'environnement Supabase (automatiquement disponibles) :
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
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Méthode non autorisée' }, 405)
  }

  try {
    // ── Lecture du corps ───────────────────────────────────────────────
    const { email, role, fullName, method, password } = await req.json() as {
      email?: string
      role?: 'user' | 'admin'
      fullName?: string
      method?: 'invite' | 'password'
      password?: string
    }

    if (!email || !role || !method) {
      return json({ error: 'Paramètres manquants : email, role et method sont requis' }, 400)
    }
    if (method === 'password' && (!password || password.length < 6)) {
      return json({ error: 'Le mot de passe provisoire doit faire au moins 6 caractères' }, 400)
    }

    // ── Client admin (SERVICE_ROLE — bypass RLS) ───────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Vérifier que l'appelant est un admin authentifié ──────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (!token) return json({ error: 'Non authentifié' }, 401)

    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !caller) return json({ error: 'Non authentifié' }, 401)

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Accès refusé : réservé aux administrateurs' }, 403)
    }

    // ── Création du compte ─────────────────────────────────────────────
    let userId: string

    if (method === 'invite') {
      // Envoie un email d'invitation avec un lien pour définir le MDP
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName ?? null },
        redirectTo: 'https://benoitbarreau.github.io/APPBE/',
      })
      if (error) throw error
      userId = data.user.id
    } else {
      // Crée le compte directement avec mot de passe provisoire
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName ?? null },
      })
      if (error) throw error
      userId = data.user.id
    }

    // ── Mise à jour du profil (créé par le trigger handle_new_user) ────
    // On attend 600 ms que le trigger INSERT INTO profiles se propage,
    // puis on upsert pour être sûr d'avoir les bonnes valeurs de rôle.
    await new Promise<void>(resolve => setTimeout(resolve, 600))

    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email,
      role,
      status: 'approved',
      full_name: fullName?.trim() || null,
    }, { onConflict: 'id' })

    return json({ success: true, userId })
  } catch (e) {
    console.error('[invite-user]', e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
