import { supabase } from './supabase'
import type { Product } from '../types'

const pgErr = (e: { message: string }) => new Error(e.message)

/** Statut d'une fiche produit dans Supabase. */
export type ProductStatus = 'pending' | 'approved'

/** Métadonnées modération associées à un produit cloud. */
export interface UserProductMeta {
  productId: string
  status: ProductStatus
  creatorId: string
  creatorName?: string
  archivedAt?: string
}

/** Résultat d'un fetch : produit + ses métadonnées. */
export interface FetchedUserProduct {
  product: Product
  meta: UserProductMeta
}

interface RawRow {
  id: string
  user_id: string
  product_data: Product
  status: ProductStatus
  archived_at: string | null
  profiles?: { full_name: string | null; email: string } | null
}

const rowToFetched = (row: RawRow): FetchedUserProduct => ({
  product: row.product_data,
  meta: {
    productId: row.id,
    status: row.status,
    creatorId: row.user_id,
    creatorName: row.profiles?.full_name?.trim() || row.profiles?.email,
    archivedAt: row.archived_at ?? undefined,
  },
})

/**
 * Charge les produits depuis Supabase :
 *  - Catalogue commun : status='approved' AND archived_at IS NULL (visible par tous)
 *  - Mon catalogue    : status='pending' de l'utilisateur courant
 *  - Pour un admin    : il voit AUSSI tous les pending des autres utilisateurs
 *
 * Les fiches archivées NE sont PAS renvoyées ici (charger via fetchArchivedUserProducts).
 */
export async function fetchUserProducts(): Promise<FetchedUserProduct[]> {
  const { data, error } = await supabase
    .from('user_products')
    .select('id, user_id, product_data, status, archived_at, profiles(full_name, email)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []).map((r) => rowToFetched(r as unknown as RawRow))
}

/**
 * Charge les fiches archivées (admin uniquement).
 * Les politiques RLS filtrent automatiquement pour les non-admins (vide).
 */
export async function fetchArchivedUserProducts(): Promise<FetchedUserProduct[]> {
  const { data, error } = await supabase
    .from('user_products')
    .select('id, user_id, product_data, status, archived_at, profiles(full_name, email)')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })
  if (error) throw pgErr(error)
  return (data ?? []).map((r) => rowToFetched(r as unknown as RawRow))
}

/**
 * Crée ou met à jour un produit custom dans Supabase.
 * - À la création, `initialStatus` détermine si la fiche va directement au
 *   catalogue commun (admin) ou en attente de validation (utilisateur).
 * - Lors d'une mise à jour, le statut existant est PRÉSERVÉ via upsert sans
 *   écraser le champ `status`.
 */
export async function upsertUserProduct(
  product: Product,
  opts: { initialStatus: ProductStatus } = { initialStatus: 'pending' },
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) throw pgErr(authError)
  if (!user) throw new Error('Non authentifié')

  // 1. Tenter une mise à jour : si la ligne existe, on ne touche QUE product_data.
  const { data: existing } = await supabase
    .from('user_products')
    .select('id')
    .eq('id', product.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('user_products')
      .update({ product_data: product, updated_at: new Date().toISOString() })
      .eq('id', product.id)
    if (error) throw pgErr(error)
    return
  }

  // 2. Sinon, insertion avec le statut initial.
  const { error } = await supabase
    .from('user_products')
    .insert({
      id: product.id,
      user_id: user.id,
      product_data: product,
      status: opts.initialStatus,
    })
  if (error) throw pgErr(error)
}

/** Suppression définitive (DELETE). Utilisée pour les fiches `pending` uniquement
 *  côté utilisateur — l'admin l'utilise depuis la section Archives. */
export async function deleteUserProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('user_products')
    .delete()
    .eq('id', productId)
  if (error) throw pgErr(error)
}

/** Validation par un admin d'une fiche pending → la fait passer en `approved`. */
export async function validateUserProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('user_products')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw pgErr(error)
}

/** Archivage d'une fiche du catalogue commun (admin uniquement).
 *  La fiche reste en base mais devient invisible des utilisateurs. */
export async function archiveUserProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('user_products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw pgErr(error)
}

/** Restauration d'une fiche archivée → repart en `approved` non archivé. */
export async function restoreUserProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from('user_products')
    .update({ archived_at: null, status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', productId)
  if (error) throw pgErr(error)
}
