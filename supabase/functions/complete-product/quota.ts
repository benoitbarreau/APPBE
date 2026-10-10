interface QuotaClient {
  rpc(name: string, args: Record<string, string>): PromiseLike<{ data: unknown; error: unknown }>
}
export class AiQuotaError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function reserveQuota(client: QuotaClient, userId: string): Promise<string> {
  const { data, error } = await client.rpc('reserve_ai_completion', { p_user_id: userId })
  if (error || !data || typeof data !== 'object') {
    throw new AiQuotaError('Vérification du quota IA indisponible. Réessayez plus tard.', 503)
  }
  const result = data as { allowed?: boolean; leaseId?: string; reason?: string; limit?: number }
  if (result.allowed === true && typeof result.leaseId === 'string') return result.leaseId
  if (result.reason === 'daily') {
    throw new AiQuotaError(`Limite quotidienne atteinte (${result.limit} demandes). Réessayez demain après minuit, heure de Paris.`, 429)
  }
  if (result.reason === 'concurrent') {
    throw new AiQuotaError('Une analyse IA est déjà en cours sur votre compte. Attendez sa fin avant de réessayer.', 429)
  }
  throw new AiQuotaError('Vérification du quota IA indisponible. Réessayez plus tard.', 503)
}
export async function releaseQuota(client: QuotaClient, userId: string, leaseId: string): Promise<void> {
  try {
    const { error } = await client.rpc('release_ai_completion', { p_user_id: userId, p_lease_id: leaseId })
    if (error) console.error('[complete-product] Libération du quota différée')
  } catch { console.error('[complete-product] Libération du quota différée') }
}
