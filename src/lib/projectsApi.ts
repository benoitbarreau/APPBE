import { supabase } from './supabase'
import type { Cable, PlacedProduct, Product, ProjectMeta, SignalDef, Tab, Zone } from '../types'

export interface ProjectData {
  // Format v2 : onglets multiples
  tabs?: Tab[]
  activeTabId?: string
  // Format v1 (legacy, migration à la volée dans loadProjectData)
  nodes?: PlacedProduct[]
  cables?: Cable[]
  zones?: Zone[]
  // Données partagées entre onglets
  projectMeta: ProjectMeta
  signals: Record<string, SignalDef>
  products: Product[]
}

// ── Versionning ────────────────────────────────────────────────────────────

export interface VersionMeta {
  id: string       // UUID du snapshot dans project_versions
  version: string  // "V1.0", "V1.1" …
  savedAt: string  // ISO date
}

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
  versions_meta: VersionMeta[]
  client_name: string
  lieu: string
  archived: boolean
  profiles?: { email: string; full_name: string | null }
}

const pgErr = (e: { message: string }) => new Error(e.message)

const PROJECT_SELECT = 'id, user_id, name, created_at, updated_at, versions_meta, client_name, lieu, archived, profiles(email, full_name)'

/** Liste les projets actifs (archived = false) ou archivés (archived = true) */
export async function listProjects(archived = false): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_SELECT)
    .eq('archived', archived)
    .order('updated_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []) as unknown as ProjectRow[]
}

/** Archive ou désarchive un projet */
export async function setProjectArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase.from('projects').update({ archived }).eq('id', id)
  if (error) throw pgErr(error)
}

/** Incrémente "V1.0" → "V1.1", "V1.9" → "V2.0" */
export function incrementVersion(v: string): string {
  const num = parseFloat(v.replace(/^V/i, ''))
  if (isNaN(num)) return 'V1.1'
  const next = Math.round((num + 0.1) * 10) / 10
  return `V${next.toFixed(1)}`
}

/** Calcule un hash léger de l'état (pour détecter les vraies modifications) */
export function computeProjectHash(
  tabs: unknown,
  products: unknown,
  signals: unknown,
): string {
  const str = JSON.stringify({ tabs, products, signals })
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return `${str.length}:${h}`
}

/** Archive une version du projet dans project_versions */
export async function saveProjectVersion(
  projectId: string,
  version: string,
  data: ProjectData,
): Promise<VersionMeta> {
  const { data: row, error } = await supabase
    .from('project_versions')
    .insert({ project_id: projectId, version, data })
    .select('id, version, saved_at')
    .single()
  if (error) throw pgErr(error)
  const r = row as { id: string; version: string; saved_at: string }
  return { id: r.id, version: r.version, savedAt: r.saved_at }
}

/** Charge un snapshot archivé */
export async function fetchProjectVersion(
  versionId: string,
): Promise<{ version: string; data: ProjectData }> {
  const { data, error } = await supabase
    .from('project_versions')
    .select('version, data')
    .eq('id', versionId)
    .single()
  if (error) throw pgErr(error)
  return data as { version: string; data: ProjectData }
}

/** Met à jour le champ versions_meta du projet (liste légère pour affichage) */
export async function updateVersionsMeta(
  projectId: string,
  versionsMeta: VersionMeta[],
): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ versions_meta: versionsMeta })
    .eq('id', projectId)
  if (error) throw pgErr(error)
}

/** Supprime les snapshots en excès (garde les N plus récents) */
export async function pruneProjectVersions(
  projectId: string,
  keepCount: number,
): Promise<void> {
  const { data, error } = await supabase
    .from('project_versions')
    .select('id')
    .eq('project_id', projectId)
    .order('saved_at', { ascending: false })
  if (error || !data) return
  const toDelete = data.slice(keepCount)
  for (const row of toDelete) {
    await supabase.from('project_versions').delete().eq('id', (row as { id: string }).id)
  }
}

export async function fetchProject(id: string): Promise<{ name: string; data: ProjectData }> {
  const { data, error } = await supabase
    .from('projects')
    .select('name, data')
    .eq('id', id)
    .single()
  if (error) throw pgErr(error)
  return data as { name: string; data: ProjectData }
}

export async function saveProject(
  id: string | null,
  name: string,
  projectData: ProjectData,
): Promise<string> {
  const client_name = projectData.projectMeta?.client ?? ''
  const lieu = projectData.projectMeta?.lieu ?? ''

  if (id) {
    const { error } = await supabase
      .from('projects')
      .update({ name, data: projectData, client_name, lieu })
      .eq('id', id)
    if (error) throw pgErr(error)
    return id
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, data: projectData, user_id: user.id, client_name, lieu })
    .select('id')
    .single()
  if (error) throw pgErr(error)
  return (data as { id: string }).id
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw pgErr(error)
}

// ── Partage de projets ─────────────────────────────────────────────────────

export interface ShareRow {
  id: string
  project_id: string
  user_id: string
  role: 'editor' | 'viewer'
  shared_by: string | null
  created_at: string
  profiles?: { email: string; full_name: string | null }
}

export async function listProjectShares(projectId: string): Promise<ShareRow[]> {
  const { data, error } = await supabase
    .from('project_shares')
    // Hint FK explicite pour éviter l'ambiguïté (user_id ET shared_by → profiles)
    .select('id, project_id, user_id, role, shared_by, created_at, profiles!project_shares_user_id_fkey(email, full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []) as unknown as ShareRow[]
}

export interface ProfileOption {
  id: string
  email: string
  full_name: string | null
}

export async function listApprovedProfiles(): Promise<ProfileOption[]> {
  const { data, error } = await supabase.rpc('list_approved_profiles')
  if (error) throw pgErr(error)
  return (data ?? []) as ProfileOption[]
}

export async function addProjectShare(
  projectId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  // Résolution email → user_id via fonction SECURITY DEFINER
  const { data: profiles, error: profileError } = await supabase
    .rpc('get_profile_by_email', { p_email: email })
  if (profileError) throw pgErr(profileError)
  if (!profiles || profiles.length === 0) {
    throw new Error(`Aucun compte approuvé trouvé pour "${email}"`)
  }
  const targetUserId = (profiles[0] as { id: string }).id

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  if (targetUserId === user.id) {
    throw new Error('Vous ne pouvez pas partager un projet avec vous-même')
  }

  const { error } = await supabase
    .from('project_shares')
    .upsert(
      { project_id: projectId, user_id: targetUserId, role, shared_by: user.id },
      { onConflict: 'project_id,user_id' },
    )
  if (error) throw pgErr(error)
}

export async function removeProjectShare(shareId: string): Promise<void> {
  const { error } = await supabase.from('project_shares').delete().eq('id', shareId)
  if (error) throw pgErr(error)
}
