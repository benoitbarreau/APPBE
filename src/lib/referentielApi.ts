import { supabase } from './supabase'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Client {
  id: string
  user_id: string
  name: string
  code: string | null
  address: string | null
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  client_id: string
  name: string
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  site_id: string
  name: string
  type: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DocType = 'pdf' | 'image' | 'link' | 'project_export'
export type EntityType = 'client' | 'site' | 'room'

export interface RefDocument {
  id: string
  entity_type: EntityType
  entity_id: string
  name: string
  doc_type: DocType
  url: string | null
  storage_path: string | null
  file_size: number | null
  created_at: string
}

export interface LinkedProject {
  id: string
  name: string
  updated_at: string
}

const pgErr = (e: { message: string }) => new Error(e.message)
const now = () => new Date().toISOString()

// ── Clients ────────────────────────────────────────────────────────────────

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name')
  if (error) throw pgErr(error)
  return (data ?? []) as Client[]
}

export async function createClient(
  input: Pick<Client, 'name'> & Partial<Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, updated_at: now() })
    .select('*')
    .single()
  if (error) throw pgErr(error)
  return data as Client
}

export async function updateClient(
  id: string,
  input: Partial<Omit<Client, 'id' | 'user_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ ...input, updated_at: now() })
    .eq('id', id)
  if (error) throw pgErr(error)
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw pgErr(error)
}

// ── Sites ──────────────────────────────────────────────────────────────────

export async function listSites(clientId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('client_id', clientId)
    .order('name')
  if (error) throw pgErr(error)
  return (data ?? []) as Site[]
}

export async function createSite(
  input: Pick<Site, 'client_id' | 'name'> & Partial<Omit<Site, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Site> {
  const { data, error } = await supabase
    .from('sites')
    .insert({ ...input, updated_at: now() })
    .select('*')
    .single()
  if (error) throw pgErr(error)
  return data as Site
}

export async function updateSite(
  id: string,
  input: Partial<Omit<Site, 'id' | 'client_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('sites')
    .update({ ...input, updated_at: now() })
    .eq('id', id)
  if (error) throw pgErr(error)
}

export async function deleteSite(id: string): Promise<void> {
  const { error } = await supabase.from('sites').delete().eq('id', id)
  if (error) throw pgErr(error)
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export async function listRooms(siteId: string): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('site_id', siteId)
    .order('name')
  if (error) throw pgErr(error)
  return (data ?? []) as Room[]
}

export async function createRoom(
  input: Pick<Room, 'site_id' | 'name'> & Partial<Omit<Room, 'id' | 'created_at' | 'updated_at'>>,
): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ ...input, updated_at: now() })
    .select('*')
    .single()
  if (error) throw pgErr(error)
  return data as Room
}

export async function updateRoom(
  id: string,
  input: Partial<Omit<Room, 'id' | 'site_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await supabase
    .from('rooms')
    .update({ ...input, updated_at: now() })
    .eq('id', id)
  if (error) throw pgErr(error)
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', id)
  if (error) throw pgErr(error)
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function listDocuments(entityType: EntityType, entityId: string): Promise<RefDocument[]> {
  const { data, error } = await supabase
    .from('ref_documents')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []) as RefDocument[]
}

export async function createDocument(
  input: Omit<RefDocument, 'id' | 'created_at'>,
): Promise<RefDocument> {
  const { data, error } = await supabase
    .from('ref_documents')
    .insert(input)
    .select('*')
    .single()
  if (error) throw pgErr(error)
  return data as RefDocument
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('ref_documents').delete().eq('id', id)
  if (error) throw pgErr(error)
}

/** Upload un fichier dans le bucket ref-documents et retourne le path de stockage */
export async function uploadDocument(
  userId: string,
  entityType: EntityType,
  entityId: string,
  file: File,
): Promise<{ storagePath: string; publicUrl: string | null }> {
  const storagePath = `${userId}/${entityType}/${entityId}/${Date.now()}_${file.name.replace(/[^a-z0-9._-]/gi, '_')}`

  const { error } = await supabase.storage
    .from('ref-documents')
    .upload(storagePath, file, { upsert: false })
  if (error) throw new Error(error.message)

  const { data: urlData } = supabase.storage
    .from('ref-documents')
    .getPublicUrl(storagePath)

  return { storagePath, publicUrl: urlData?.publicUrl ?? null }
}

/** Génère une URL signée (valable 1 heure) pour accéder à un fichier privé */
export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('ref-documents')
    .createSignedUrl(storagePath, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/** Supprime un fichier du storage */
export async function deleteStorageFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from('ref-documents')
    .remove([storagePath])
  if (error) throw new Error(error.message)
}

// ── Projets liés à une salle ───────────────────────────────────────────────

export async function listProjectsByRoom(roomId: string): Promise<LinkedProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at')
    .eq('room_id', roomId)
    .order('updated_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []) as LinkedProject[]
}

/** Associe (ou dissocie si roomId = null) un projet à une salle */
export async function linkProjectToRoom(projectId: string, roomId: string | null): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ room_id: roomId })
    .eq('id', projectId)
  if (error) throw pgErr(error)
}
