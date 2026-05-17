/**
 * Edge Function : invite-user
 *
 * Permet à un administrateur de créer un compte utilisateur de deux façons :
 *   - "invite"   → génère un lien d'invitation et l'envoie via l'API Resend
 *   - "password" → crée le compte directement avec un mot de passe provisoire
 *
 * Corps de la requête POST :
 *   { email: string, role: "user"|"admin", fullName?: string,
 *     method: "invite"|"password", password?: string }
 *
 * Secrets Supabase requis (partagés avec notify-admin-new-user) :
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — injectés automatiquement
 *   RESEND_API_KEY                            — clé API Resend
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL = 'https://benoitbarreau.github.io/APPBE/'
const FROM_EMAIL = 'SynoX-AV <noreply@videosynergie.com>'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function inviteEmailHtml(inviteLink: string, fullName?: string): string {
  const greeting = fullName ? `Bonjour ${fullName},` : 'Bonjour,'
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#1e40af;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">SynoX-AV</span>
            <span style="color:#93c5fd;font-size:14px;margin-left:12px">Invitation</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Invitation à rejoindre SynoX-AV</h2>
            <p style="margin:0 0 8px;color:#6b7280;font-size:14px">${greeting}</p>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
              Vous avez été invité(e) à accéder à la plateforme SynoX-AV de création de synoptiques audiovisuels.
              Cliquez sur le bouton ci-dessous pour créer votre mot de passe et accéder à votre compte.
            </p>
            <a href="${inviteLink}"
               style="display:inline-block;padding:12px 24px;background:#1e40af;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
              Accepter l'invitation →
            </a>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">
              Ce lien est valable 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;color:#9ca3af;font-size:12px">
              Cet e-mail a été envoyé automatiquement par SynoX-AV. Ne pas y répondre.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendInviteEmail(
  resendKey: string,
  to: string,
  inviteLink: string,
  fullName?: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Vous avez été invité(e) à utiliser SynoX-AV',
      html: inviteEmailHtml(inviteLink, fullName),
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Resend API error: ${errText}`)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
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

    // ── Création du compte ─────────────────────────────────────────────
    let userId: string

    if (method === 'invite') {
      // Générer le lien d'invitation (ne déclenche pas de SMTP Supabase)
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: APP_URL,
          data: { full_name: fullName ?? null },
        },
      })
      if (linkErr) throw linkErr
      userId = linkData.user.id

      // Envoyer l'email via l'API Resend (pas de SMTP)
      const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
      if (!resendKey) throw new Error('RESEND_API_KEY non configuré dans les secrets Supabase')
      await sendInviteEmail(resendKey, email, linkData.properties.action_link, fullName)
    } else {
      // Création directe avec mot de passe provisoire
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName ?? null },
      })
      if (error) throw error
      userId = data.user.id
    }

    // ── Mise à jour du profil ──────────────────────────────────────────
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
