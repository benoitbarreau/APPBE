import { supabase } from './supabase'
import type { RackSize } from '../types'

// ── Caractéristiques proposées par l'IA (Edge Function complete-product) ─────

export interface AiPort {
  label: string
  signal: string
  direction: 'in' | 'out' | 'bi'
}

/** Specs renvoyées par l'IA. Tous les champs sont optionnels : l'IA n'invente
 *  rien, elle laisse absent ce qu'elle n'a pas trouvé dans le PDF. */
export interface ProductAiSpecs {
  inputs?: AiPort[]
  outputs?: AiPort[]
  powerOperatingW?: number
  powerStandbyW?: number
  thermalBtuH?: number
  rackHeightU?: number
  rackSize?: RackSize
  widthCm?: number
  depthCm?: number
  heightCm?: number
  weightKg?: number
  /** Phrase libre sur ce que l'IA n'a pas pu déterminer avec certitude. */
  notes?: string
}

export interface CompleteProductParams {
  pdfUrl: string
  manufacturer?: string
  reference?: string
  category?: string
  /** Identifiants des types de signaux connus de l'app (pour ranger les ports). */
  signalTypes?: string[]
}

/**
 * Appelle l'Edge Function complete-product : envoie le PDF d'une fiche technique
 * à Gemini et récupère les caractéristiques extraites. L'authentification est
 * passée automatiquement par supabase.functions.invoke.
 */
export async function completeProductFromPdf(
  params: CompleteProductParams,
): Promise<ProductAiSpecs> {
  const { data, error } = await supabase.functions.invoke<{
    success: boolean
    specs: ProductAiSpecs
    error?: string
  }>('complete-product', { body: params })

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
  return data.specs
}
