import type { UserStatus } from '../../auth/AuthContext'

// ── Types du tableau de bord admin ──────────────────────────────────────────

export type FilterStatus = UserStatus | 'all'

export interface AdminLog {
  id: string
  admin_id: string | null
  action: string
  target_id: string | null
  target_label: string | null
  details: Record<string, unknown>
  created_at: string
  admin?: { full_name: string | null; email: string | null } | null
}
