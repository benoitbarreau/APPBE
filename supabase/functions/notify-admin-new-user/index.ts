/**
 * Edge Function : notify-admin-new-user
 *
 * Déclenchée par un Database Webhook sur INSERT dans public.profiles.
 * Envoie un e-mail de notification à l'administrateur via l'API Resend.
 *
 * Secrets Supabase requis (Dashboard → Edge Functions → Secrets) :
 *   RESEND_API_KEY  — clé API Resend
 *   ADMIN_EMAIL     — adresse de destination (ex. admin@videosynergie.com)
 *   FROM_EMAIL      — adresse expéditrice vérifiée dans Resend
 *                     (ex. SynoX-AV <notifications@videosynergie.com>)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL')    ?? 'admin@videosynergie.com'
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')     ?? 'SynoX-AV <notifications@videosynergie.com>'

serve(async (req: Request) => {
  try {
    // Payload envoyé par le Database Webhook Supabase
    const payload = await req.json()

    // Le record est dans payload.record (webhook Supabase v2)
    // ou directement dans payload (webhook personnalisé)
    const record = (payload as { record?: Record<string, unknown> }).record ?? payload

    const email     = String(record.email     ?? '—')
    const full_name = String(record.full_name ?? '—')
    const created_at = String(record.created_at ?? new Date().toISOString())

    // Formater la date en français
    const dateStr = new Date(created_at).toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    })

    // Appel Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject: 'Nouvelle inscription sur SynoX-AV',
        html: `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:24px 32px">
              <span style="color:#fff;font-size:20px;font-weight:700">SynoX-AV</span>
              <span style="color:#93c5fd;font-size:14px;margin-left:12px">Administration</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px">
              <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Nouvelle demande d'inscription</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
                Un nouvel utilisateur vient de s'inscrire et attend votre approbation.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;width:120px;color:#6b7280;font-size:13px">Nom</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:500">${full_name}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px">E-mail</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:500">${email}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;color:#6b7280;font-size:13px">Inscrit le</td>
                  <td style="padding:12px 16px;color:#111827;font-size:13px;font-weight:500">${dateStr}</td>
                </tr>
              </table>

              <a href="https://benoitbarreau.github.io/APPBE/"
                 style="display:inline-block;padding:12px 24px;background:#1e40af;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
                Accéder à l'administration →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
              <p style="margin:0;color:#9ca3af;font-size:12px">
                Cet e-mail a été envoyé automatiquement par SynoX-AV. Ne pas y répondre.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[notify-admin] Resend error:', errText)
      return new Response(JSON.stringify({ error: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    console.log('[notify-admin] Email envoyé :', data)
    return new Response(JSON.stringify({ success: true, id: (data as { id?: string }).id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[notify-admin] Exception :', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
