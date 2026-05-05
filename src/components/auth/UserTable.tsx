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

const fmtLastLogin = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function UserTable({
  profiles,
  currentUserId,
  onUpdateStatus,
  onUpdateRole,
}: {
  profiles: Profile[]
  currentUserId: string
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
            <th>Dernière connexion</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => {
            const isSelf = p.id === currentUserId
            return (
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
                    disabled={isSelf}
                    title={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle' : undefined}
                  >
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </td>
                <td className="user-table-last-login">
                  {fmtLastLogin(p.last_sign_in_at)}
                </td>
                <td>
                  {isSelf ? (
                    <span className="muted user-table-self-label">Votre compte</span>
                  ) : (
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
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
