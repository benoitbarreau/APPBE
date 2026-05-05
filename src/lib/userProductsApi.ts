import { supabase } from './supabase'
import type { Product } from '../types'

const pgErr = (e: { message: string }) => new Error(e.message)

/** Charge tous les produits custom de l'utilisateur connecté depuis Supabase */
export async function fetchUserProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('user_products')
    .select('product_data')
    .order('created_at', { ascending: true })
  if (error) throw pgErr(error)
  return (data ?? []).map((row: { product_data: unknown }) => row.product_data as Product)
}

/**
 * Crée ou met à jour un produit custom dans Supabase.
 * Upsert sur la clé primaire (product.id).
 */
export async function upsertUserProduct(product: Product): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')

  const { error } = await supabase
    .from('user_products')
    .upsert(
      { id: product.id, user_id: user.id, product_data: product },
      { onConflict: 'id' },
    )
  if (error) throw pgErr(error)
}

/** Supprime un produit custom de Supabase */
export async function deleteUserProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('user_products')
    .delete()
    .eq('id', productId)
  if (error) throw pgErr(error)
}
