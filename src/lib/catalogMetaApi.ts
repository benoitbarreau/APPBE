import { supabase } from './supabase'

export interface CatalogBrand {
  id: string
  name: string
}

export interface CatalogCategory {
  id: string
  name: string
  color: string
}

const pgErr = (e: { message: string }) => new Error(e.message)

// ── Marques ──────────────────────────────────────────────────────────────

export async function fetchBrands(): Promise<CatalogBrand[]> {
  const { data, error } = await supabase
    .from('catalog_brands')
    .select('id, name')
    .order('name', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []) as CatalogBrand[]
}

export async function createBrand(name: string): Promise<CatalogBrand> {
  const { data, error } = await supabase
    .from('catalog_brands')
    .insert({ name: name.trim() })
    .select('id, name')
    .single()
  if (error) throw pgErr(error)
  return data as CatalogBrand
}

export async function updateBrand(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('catalog_brands')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw pgErr(error)
}

export async function deleteBrand(id: string): Promise<void> {
  const { error } = await supabase
    .from('catalog_brands')
    .delete()
    .eq('id', id)
  if (error) throw pgErr(error)
}

// ── Catégories ────────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<CatalogCategory[]> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .select('id, name, color')
    .order('name', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []) as CatalogCategory[]
}

export async function createCategory(name: string, color: string): Promise<CatalogCategory> {
  const { data, error } = await supabase
    .from('catalog_categories')
    .insert({ name: name.trim(), color })
    .select('id, name, color')
    .single()
  if (error) throw pgErr(error)
  return data as CatalogCategory
}

export async function updateCategory(id: string, name: string, color: string): Promise<void> {
  const { error } = await supabase
    .from('catalog_categories')
    .update({ name: name.trim(), color })
    .eq('id', id)
  if (error) throw pgErr(error)
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('catalog_categories')
    .delete()
    .eq('id', id)
  if (error) throw pgErr(error)
}
