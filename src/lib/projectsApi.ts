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

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, created_at, updated_at, profiles(email, full_name)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProjectRow[]
}

export async function fetchProject(id: string): Promise<{ name: string; data: ProjectData }> {
  const { data, error } = await supabase
    .from('projects')
    .select('name, data')
    .eq('id', id)
    .single()
  if (error) throw error
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
    if (error) throw error
    return id
  }
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, data: projectData })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}
