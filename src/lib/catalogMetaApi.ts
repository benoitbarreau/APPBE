import { supabase } from './supabase'

export interface CatalogBrand {
  id: string
  name: string
  logo?: string   // URL externe (https://…) OU data-URL base64
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
    .select('id, name, logo')
    .order('name', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []) as CatalogBrand[]
}

/** Met à jour le logo d'une marque (URL externe ou base64). Passer null pour supprimer. */
export async function updateBrandLogo(id: string, logo: string | null): Promise<void> {
  const { error } = await supabase
    .from('catalog_brands')
    .update({ logo })
    .eq('id', id)
  if (error) throw pgErr(error)
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

// ── Import automatique depuis user_products ───────────────────────────────
// Lit toutes les marques et catégories déjà utilisées dans les produits
// et les insère dans les tables de référentiel (ignore les doublons).

export interface ImportResult {
  brands: CatalogBrand[]
  categories: CatalogCategory[]
}

export async function importMetaFromProducts(): Promise<ImportResult> {
  // 1. Récupérer tous les produits
  const { data: rows, error } = await supabase
    .from('user_products')
    .select('product_data')
  if (error) throw pgErr(error)

  const products = (rows ?? []).map((r: { product_data: unknown }) => r.product_data as Record<string, string>)

  // 2. Extraire les valeurs uniques
  const brandNames = [...new Set(
    products.map(p => (p.manufacturer ?? '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'fr'))

  const categoryNames = [...new Set(
    products.map(p => (p.category ?? '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'fr'))

  // 3. Insérer les marques (ignore les conflits sur le nom)
  let brands: CatalogBrand[] = []
  if (brandNames.length > 0) {
    const { data: bd, error: be } = await supabase
      .from('catalog_brands')
      .upsert(brandNames.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true })
      .select('id, name')
    if (be) throw pgErr(be)
    brands = (bd ?? []) as CatalogBrand[]
  }

  // 4. Insérer les catégories (ignore les conflits sur le nom)
  let categories: CatalogCategory[] = []
  if (categoryNames.length > 0) {
    const { data: cd, error: ce } = await supabase
      .from('catalog_categories')
      .upsert(categoryNames.map(name => ({ name, color: '#6c7480' })), { onConflict: 'name', ignoreDuplicates: true })
      .select('id, name, color')
    if (ce) throw pgErr(ce)
    categories = (cd ?? []) as CatalogCategory[]
  }

  return { brands, categories }
}
