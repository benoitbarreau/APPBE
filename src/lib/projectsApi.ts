import { supabase } from './supabase'
import type { Cable, PlacedProduct, Product, ProjectMeta, SignalDef, Zone } from '../types'

export interface ProjectData {
  nodes: PlacedProduct[]
  cables: Cable[]
  projectMeta: ProjectMeta
  signals: Record<string, SignalDef>
  zones: Zone[]
  products: Product[]
}

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
  profiles?: { email: string; full_name: string | null }
}

const pgErr = (e: { message: string }) => new Error(e.message)

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, created_at, updated_at, profiles(email, full_name)')
    .order('updated_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []) as unknown as ProjectRow[]
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
  if (id) {
    const { error } = await supabase
      .from('projects')
      .update({ name, data: projectData })
      .eq('id', id)
    if (error) throw pgErr(error)
    return id
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, data: projectData, user_id: user.id })
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
    .select('id, project_id, user_id, role, shared_by, created_at, profiles(email, full_name)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []) as unknown as ShareRow[]
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
