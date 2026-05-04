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
