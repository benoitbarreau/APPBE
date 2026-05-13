import { supabase } from './supabase'
import type { SignalDef, Zone } from '../types'

const pgErr = (e: { message: string }) => new Error(e.message)

// ── Signaux ────────────────────────────────────────────────────────────────

export async function fetchUserSignals(): Promise<Record<string, SignalDef>> {
  const { data, error } = await supabase
    .from('user_signals')
    .select('signal_data')
    .order('created_at', { ascending: true })
  if (error) throw pgErr(error)
  const result: Record<string, SignalDef> = {}
  for (const row of (data ?? [])) {
    const def = (row as { signal_data: unknown }).signal_data as SignalDef
    result[def.id] = def
  }
  return result
}

export async function upsertUserSignal(def: SignalDef): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  const { error } = await supabase
    .from('user_signals')
    .upsert({ id: def.id, user_id: user.id, signal_data: def }, { onConflict: 'id' })
  if (error) throw pgErr(error)
}

export async function deleteUserSignal(signalId: string): Promise<void> {
  const { error } = await supabase.from('user_signals').delete().eq('id', signalId)
  if (error) throw pgErr(error)
}

/** Supprime tous les signaux personnalisés de l'utilisateur courant.
 *  Utilisé par la fonction « Réinitialiser la légende » pour que les
 *  signaux par défaut ne soient pas réécrasés par d'anciennes entrées
 *  cloud au prochain rechargement. */
export async function deleteAllUserSignals(): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  const { error } = await supabase.from('user_signals').delete().eq('user_id', user.id)
  if (error) throw pgErr(error)
}

// ── Zones ──────────────────────────────────────────────────────────────────

export async function fetchUserZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('user_zones')
    .select('zone_data')
    .order('created_at', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []).map((row: { zone_data: unknown }) => row.zone_data as Zone)
}

export async function upsertUserZone(zone: Zone): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  const { error } = await supabase
    .from('user_zones')
    .upsert({ id: zone.id, user_id: user.id, zone_data: zone }, { onConflict: 'id' })
  if (error) throw pgErr(error)
}

export async function deleteUserZone(zoneId: string): Promise<void> {
  const { error } = await supabase.from('user_zones').delete().eq('id', zoneId)
  if (error) throw pgErr(error)
}
