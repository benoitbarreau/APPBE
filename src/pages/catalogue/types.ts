// ── Types partagés du module Catalogue ──────────────────────────────────────

export type FilterMode  = 'all' | 'builtin' | 'approved' | 'mine' | 'pending'
export type ViewMode    = 'byBrand' | 'byCategory'
export type DetailView  = 'grid' | 'list'
export type ListSortKey = 'reference' | 'manufacturer' | 'category' | 'rack'
