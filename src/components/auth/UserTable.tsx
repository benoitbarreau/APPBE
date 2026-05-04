import type { Profile, UserRole, UserStatus } from '../../auth/AuthContext'

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
}

const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'status-pending',
  approved: 'status-approved',
  rejected: 'status-rejected',
}

export function UserTable({
  profiles,
  onUpdateStatus,
  onUpdateRole,
}: {
  profiles: Profile[]
  onUpdateStatus: (id: string, status: UserStatus) => Promise<void>
  onUpdateRole: (id: string, role: UserRole) => Promise<void>
}) {
  if (profiles.length === 0) {
    return <div className="muted" style={{ padding: 16 }}>Aucun utilisateur dans cette catégorie.</div>
  }

  return (
    <div className="user-table-wrap">
      <table className="user-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Statut</th>
            <th>Rôle</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => (
            <tr key={p.id}>
              <td>{p.full_name ?? '—'}</td>
              <td>{p.email}</td>
              <td>
                <span className={`status-badge ${STATUS_CLASS[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td>
                <select
                  value={p.role}
                  onChange={e => void onUpdateRole(p.id, e.target.value as UserRole)}
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </td>
              <td>
                <div className="user-table-actions">
                  {p.status !== 'approved' && (
                    <button
                      className="primary"
                      onClick={() => void onUpdateStatus(p.id, 'approved')}
                    >
                      Valider
                    </button>
                  )}
                  {p.status !== 'rejected' && (
                    <button
                      className="danger"
                      onClick={() => void onUpdateStatus(p.id, 'rejected')}
                    >
                      Refuser
                    </button>
                  )}
                  {p.status !== 'pending' && (
                    <button onClick={() => void onUpdateStatus(p.id, 'pending')}>
                      En attente
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
