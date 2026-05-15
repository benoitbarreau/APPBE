import { useState } from 'react'
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
  onDeleteUser,
}: {
  profiles: Profile[]
  currentUserId: string
  onUpdateStatus: (id: string, status: UserStatus) => Promise<void>
  onUpdateRole: (id: string, role: UserRole) => Promise<void>
  onDeleteUser: (id: string) => Promise<void>
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await onDeleteUser(id)
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

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
            <th>Société</th>
            <th>Statut</th>
            <th>Rôle</th>
            <th>Dernière connexion</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map(p => {
            const isSelf = p.id === currentUserId
            const isExternal = !p.email.endsWith('@videosynergie.com')
            const isConfirming = confirmDeleteId === p.id

            return (
              <tr key={p.id}>
                <td>{p.full_name ?? '—'}</td>
                <td>{p.email}</td>
                <td>
                  {isExternal && (p.company_name || p.company_logo_url) ? (
                    <div className="user-table-company">
                      {p.company_logo_url && (
                        <img
                          src={p.company_logo_url}
                          alt="Logo"
                          className="user-table-company-logo"
                        />
                      )}
                      {p.company_name && (
                        <span className="user-table-company-name">{p.company_name}</span>
                      )}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
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

                      {/* Suppression — uniquement pour les utilisateurs refusés */}
                      {p.status === 'rejected' && !isConfirming && (
                        <button
                          className="danger"
                          title="Supprimer définitivement ce compte"
                          onClick={() => setConfirmDeleteId(p.id)}
                        >
                          🗑
                        </button>
                      )}
                      {p.status === 'rejected' && isConfirming && (
                        <div className="user-table-confirm-delete">
                          <span>Supprimer&nbsp;?</span>
                          <button
                            className="danger"
                            disabled={deleting}
                            onClick={() => void handleDelete(p.id)}
                          >
                            Oui
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}>
                            Non
                          </button>
                        </div>
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
