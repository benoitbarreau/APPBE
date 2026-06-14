/**
 * Edge Function : complete-product
 *
 * Complète automatiquement une fiche produit AV à partir de sa fiche
 * technique PDF, via l'IA Google Gemini (gratuite).
 *
 * Principe (Mode B — lecture du PDF) :
 *   1. Reçoit l'URL publique d'un PDF (bucket product-datasheets) + le
 *      contexte (marque, référence, catégorie, types de signaux connus).
 *   2. Télécharge le PDF et l'envoie à Gemini avec un schéma JSON strict.
 *   3. Renvoie les caractéristiques extraites (connectique, alimentation,
 *      dimensions, format rack…) — JAMAIS publiées : l'app les propose à
 *      l'utilisateur qui valide.
 *
 * Corps de la requête POST :
 *   {
 *     pdfUrl: string,            // URL publique du PDF
 *     manufacturer?: string,
 *     reference?: string,
 *     category?: string,
 *     signalTypes?: string[],    // types de signaux connus de l'app (HDMI, SDI…)
 *   }
 *
 * Secrets Supabase requis :
 *   GEMINI_API_KEY                            — clé API Google AI Studio
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — injectés automatiquement
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Modèle Gemini : rapide, sait lire les PDF et produire du JSON.
// NB : la disponibilité du palier gratuit dépend du modèle ET du projet Google.
// Si un modèle renvoie « free_tier_requests limit: 0 », en essayer un autre.
const GEMINI_MODEL = 'gemini-2.5-flash'

// Taille max du PDF traité (le base64 gonfle d'environ +33 % ; on reste prudent).
const MAX_PDF_BYTES = 15 * 1024 * 1024 // 15 Mo

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── Schéma JSON imposé à Gemini (sous-ensemble OpenAPI) ─────────────────────
// On force une sortie structurée : pas de texte libre, que des champs connus.
const PORT_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'Nom du connecteur tel qu\'écrit sur la fiche (ex. "HDMI 1", "SDI OUT")' },
    signal: { type: 'string', description: 'Type de signal, choisi STRICTEMENT dans la liste fournie si possible' },
    direction: { type: 'string', enum: ['in', 'out', 'bi'], description: 'in=entrée, out=sortie, bi=bidirectionnel' },
  },
  required: ['label', 'signal', 'direction'],
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    inputs: { type: 'array', items: PORT_SCHEMA, description: 'Connecteurs d\'entrée' },
    outputs: { type: 'array', items: PORT_SCHEMA, description: 'Connecteurs de sortie' },
    powerOperatingW: { type: 'number', description: 'Consommation en fonctionnement (Watts)' },
    powerStandbyW: { type: 'number', description: 'Consommation en veille (Watts)' },
    thermalBtuH: { type: 'number', description: 'Dissipation thermique (BTU/h)' },
    rackHeightU: { type: 'number', description: 'Hauteur en U rack' },
    rackSize: { type: 'string', enum: ['19', '10'], description: 'Largeur rack en pouces' },
    widthCm: { type: 'number', description: 'Largeur en cm' },
    depthCm: { type: 'number', description: 'Profondeur en cm' },
    heightCm: { type: 'number', description: 'Hauteur en cm' },
    weightKg: { type: 'number', description: 'Poids en kg' },
    notes: { type: 'string', description: 'Champs incertains ou non trouvés, en une phrase. Vide si tout est sûr.' },
  },
}

function buildPrompt(ctx: {
  manufacturer?: string; reference?: string; category?: string; signalTypes?: string[]
}): string {
  const signalList = (ctx.signalTypes ?? []).filter(Boolean)
  return [
    'Tu es un expert en matériel audiovisuel professionnel.',
    'Analyse la fiche technique PDF fournie et extrais les caractéristiques du produit.',
    ctx.manufacturer ? `Marque : ${ctx.manufacturer}.` : '',
    ctx.reference ? `Référence : ${ctx.reference}.` : '',
    ctx.category ? `Catégorie : ${ctx.category}.` : '',
    '',
    'RÈGLES IMPORTANTES :',
    '- N\'invente JAMAIS de valeur. Si une donnée n\'est pas clairement dans le PDF, laisse le champ absent.',
    '- Pour les dimensions, convertis en centimètres. Pour le poids, convertis en kilogrammes.',
    '- Pour chaque connecteur, indique le sens : in (entrée), out (sortie) ou bi (bidirectionnel).',
    signalList.length
      ? `- Pour le champ "signal" de chaque connecteur, choisis OBLIGATOIREMENT une valeur de cette liste si elle correspond : ${signalList.join(', ')}. Sinon, mets le type le plus proche en minuscules.`
      : '- Pour le champ "signal", utilise un type court en minuscules (ex. hdmi, sdi, xlr, ethernet).',
    '- Regroupe les connecteurs identiques mais numérote-les distinctement (ex. "HDMI 1", "HDMI 2").',
    '- Dans "notes", signale en une phrase ce que tu n\'as pas pu déterminer avec certitude.',
  ].filter(Boolean).join('\n')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  try {
    const { pdfUrl, manufacturer, reference, category, signalTypes } = await req.json() as {
      pdfUrl?: string
      manufacturer?: string
      reference?: string
      category?: string
      signalTypes?: string[]
    }

    if (!pdfUrl) return json({ error: 'Paramètre manquant : pdfUrl est requis' }, 400)

    // ── Vérifier que l'appelant est authentifié ────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Non authentifié' }, 401)
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !caller) return json({ error: 'Non authentifié' }, 401)

    // ── Clé Gemini ─────────────────────────────────────────────────────
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
    if (!geminiKey) {
      return json({ error: 'Clé IA non configurée (GEMINI_API_KEY manquant dans les secrets Supabase).' }, 503)
    }

    // ── Télécharger le PDF ─────────────────────────────────────────────
    const pdfRes = await fetch(pdfUrl)
    if (!pdfRes.ok) {
      return json({ error: `Impossible de télécharger le PDF (HTTP ${pdfRes.status}).` }, 400)
    }
    const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer())
    if (pdfBuf.byteLength > MAX_PDF_BYTES) {
      return json({ error: `PDF trop volumineux (${Math.round(pdfBuf.byteLength / 1024 / 1024)} Mo, max ${MAX_PDF_BYTES / 1024 / 1024} Mo).` }, 400)
    }
    const pdfBase64 = encodeBase64(pdfBuf)

    // ── Appel Gemini ───────────────────────────────────────────────────
    const geminiBody = {
      contents: [{
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
          { text: buildPrompt({ manufacturer, reference, category, signalTypes }) },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`

    // Appel avec une nouvelle tentative en cas de 429 (limite de débit passagère).
    let geminiRes: Response | null = null
    let lastErrText = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      })
      if (res.ok) { geminiRes = res; break }
      lastErrText = await res.text()
      console.error(`[complete-product] Gemini HTTP ${res.status} (tentative ${attempt + 1}):`, lastErrText)
      if (res.status === 429 && attempt === 0) {
        // Pause courte puis nouvel essai
        await new Promise((r) => setTimeout(r, 4000))
        continue
      }
      // Extraire le message lisible renvoyé par Google
      let detail = lastErrText
      try {
        const parsed = JSON.parse(lastErrText) as { error?: { message?: string } }
        if (parsed?.error?.message) detail = parsed.error.message
      } catch { /* garder le texte brut */ }
      detail = detail.slice(0, 400)
      const prefix = res.status === 429
        ? 'Quota IA Gemini dépassé (limite du palier gratuit atteinte).'
        : `Erreur de l'IA (HTTP ${res.status}).`
      return json({ error: `${prefix} Détail Google : ${detail}` }, 502)
    }

    if (!geminiRes) {
      const detail = (lastErrText || '').slice(0, 400)
      return json({ error: `Quota IA Gemini dépassé (limite du palier gratuit). Détail Google : ${detail}` }, 502)
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) {
      return json({ error: 'L\'IA n\'a renvoyé aucune donnée exploitable.' }, 502)
    }

    let specs: unknown
    try {
      specs = JSON.parse(rawText)
    } catch {
      console.error('[complete-product] JSON invalide:', rawText)
      return json({ error: 'Réponse de l\'IA illisible (JSON invalide).' }, 502)
    }

    return json({ success: true, specs })
  } catch (e) {
    console.error('[complete-product]', e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
