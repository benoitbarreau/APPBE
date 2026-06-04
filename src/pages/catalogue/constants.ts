import { BUILTIN_CATALOG } from '../../catalog'
import type { FilterMode } from './types'

// ── Identifiants des produits intégrés (catalogue d'usine) ──────────────────
export const BUILTIN_IDS = new Set(BUILTIN_CATALOG.map(p => p.id))

// ── Définition des pastilles de filtre par statut ───────────────────────────
export const PILL_DEFS: { mode: FilterMode; label: string; alert?: boolean }[] = [
  { mode: 'all',      label: 'Tous' },
  { mode: 'builtin',  label: 'Intégrés' },
  { mode: 'approved', label: 'Commun' },
  { mode: 'mine',     label: 'Mes fiches' },
  { mode: 'pending',  label: 'En attente', alert: true },
]
