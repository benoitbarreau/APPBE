import type { FilterStatus } from './types'

// ── Libellés des filtres de statut utilisateur ──────────────────────────────
export const FILTER_LABELS: Record<FilterStatus, string> = {
  all: 'Tous', pending: 'En attente', approved: 'Approuvés', rejected: 'Refusés',
}

// ── Libellés et icônes des actions du journal d'activité ────────────────────
export const ACTION_LABELS: Record<string, string> = {
  approve_user:   'Utilisateur approuvé',
  reject_user:    'Utilisateur refusé',
  delete_user:    'Utilisateur supprimé',
  update_user:    'Utilisateur modifié',
  invite_user:    'Invitation envoyée',
  restore_product:'Produit restauré',
  delete_product: 'Produit supprimé définitivement',
}

export const ACTION_ICONS: Record<string, string> = {
  approve_user:   '✅',
  reject_user:    '❌',
  delete_user:    '🗑',
  update_user:    '✏️',
  invite_user:    '✉️',
  restore_product:'↻',
  delete_product: '🗑',
}
