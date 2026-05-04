import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UserTable } from '../components/auth/UserTable'
import type { Profile, UserStatus, UserRole } from '../auth/AuthContext'

type FilterStatus = UserStatus | 'all'

const FILTER_LABELS: Record<FilterStatus, string> = {
  all: 'Tous',
  pending: 'En attente',
  approved: 'Approuvés',
  rejected: 'Refusés',
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  useEffect(() => {
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfiles((data as Profile[]) ?? [])
        setLoading(false)
      })
  }, [])

  const updateStatus = async (id: string, status: UserStatus) => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  const updateRole = async (id: string, role: UserRole) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
  }

  const filtered = filterStatus === 'all'
    ? profiles
    : profiles.filter(p => p.status === filterStatus)

  const filters: FilterStatus[] = ['all', 'pending', 'approved', 'rejected']

  return (
    <div className="modal-backdrop">
      <div className="modal admin-dashboard-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tableau de bord administrateur</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="admin-dashboard-body">
          <div className="admin-filter-bar">
            <span className="muted">Filtrer :</span>
            {filters.map(s => (
              <button
                key={s}
                className={filterStatus === s ? 'primary' : ''}
                onClick={() => setFilterStatus(s)}
              >
                {FILTER_LABELS[s]}
              </button>
            ))}
            <span className="muted admin-filter-count">
              {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
          {loading
            ? <div className="auth-loading-inline">Chargement…</div>
            : <UserTable
                profiles={filtered}
                onUpdateStatus={updateStatus}
                onUpdateRole={updateRole}
              />
          }
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}
