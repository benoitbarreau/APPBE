import { useState } from 'react'
import type { Profile, UserRole, UserStatus } from '../../auth/AuthContext'

// ── Libellés et classes de statut ─────────────────────────────────────────

const STATUS_LABEL: Record<UserStatus, string> = {
  pending:  'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
}

const STATUS_CLASS: Record<UserStatus, string> = {
  pending:  'status-pending',
  approved: 'status-approved',
  rejected: 'status-rejected',
}

// ── Palette d'avatars (couleur basée sur la première lettre de l'email) ───

const AVATAR_PALETTES = [
  { bg: '#dbeafe', color: '#1e40af' },
  { bg: '#d1fae5', color: '#065f46' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#ede9fe', color: '#5b21b6' },
  { bg: '#fef3c7', color: '#92400e' },
  { bg: '#e0f2fe', color: '#075985' },
  { bg: '#fee2e2', color: '#991b1b' },
  { bg: '#f0fdf4', color: '#14532d' },
]

const getAvatarStyle = (email: string) =>
  AVATAR_PALETTES[email.charCodeAt(0) % AVATAR_PALETTES.length]

const getAvatarLetter = (p: Profile) =>
  (p.full_name?.trim() ? p.full_name.trim() : p.email)[0].toUpperCase()

// ── Formatage de la dernière connexion ────────────────────────────────────

const fmtLastLogin = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7)  return `Il y a ${diffDays}j`
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short',
    year: diffDays > 365 ? 'numeric' : undefined,
  })
}

// ── Composant ─────────────────────────────────────────────────────────────

export function UserTable({
  profiles,
  currentUserId,
  onUpdateStatus,
  onUpdateRole,
  onDeleteUser,
  onEditUser,
}: {
  profiles: Profile[]
  currentUserId: string
  onUpdateStatus: (id: string, status: UserStatus) => Promise<void>
  onUpdateRole:   (id: string, role: UserRole)     => Promise<void>
  onDeleteUser:   (id: string)                      => Promise<void>
  onEditUser:     (profile: Profile)                => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try   { await onDeleteUser(id) }
    finally { setDeleting(false); setConfirmDeleteId(null) }
  }

  if (profiles.length === 0) {
    return (
      <div className="user-list-empty">
        Aucun utilisateur dans cette catégorie.
      </div>
    )
  }

  return (
    <div className="user-list">

      {/* En-tête de colonne */}
      <div className="user-list-header">
        <span className="user-list-hcol user-list-hcol--main">Utilisateur</span>
        <span className="user-list-hcol user-list-hcol--status">Statut</span>
        <span className="user-list-hcol user-list-hcol--role">Rôle</span>
        <span className="user-list-hcol user-list-hcol--login">Connexion</span>
        <span className="user-list-hcol user-list-hcol--actions">Actions</span>
      </div>

      {/* Rangées utilisateurs */}
      {profiles.map(p => {
        const isSelf       = p.id === currentUserId
        const isExternal   = !p.email.endsWith('@videosynergie.com')
        const isConfirming = confirmDeleteId === p.id
        const avatarStyle  = getAvatarStyle(p.email)
        const avatarLetter = getAvatarLetter(p)

        return (
          <div
            key={p.id}
            className={[
              'user-card',
              isSelf            ? 'user-card--self'    : '',
              p.status === 'pending'   ? 'user-card--pending'  : '',
              p.status === 'rejected'  ? 'user-card--rejected' : '',
            ].filter(Boolean).join(' ')}
          >
            {/* Avatar */}
            <div
              className="user-avatar"
              style={{ background: avatarStyle.bg, color: avatarStyle.color }}
            >
              {avatarLetter}
            </div>

            {/* Info principale */}
            <div className="user-info user-list-hcol--main">
              <div className="user-info-name">
                <span className="user-info-fullname">{p.full_name ?? '—'}</span>
                {isSelf && <span className="user-self-chip">Vous</span>}
                {isExternal && p.company_name && (
                  <span className="user-company-chip">
                    {p.company_logo_url && (
                      <img
                        src={p.company_logo_url}
                        alt=""
                        className="user-company-chip-logo"
                      />
                    )}
                    {p.company_name}
                  </span>
                )}
              </div>
              <div className="user-info-email">{p.email}</div>
            </div>

            {/* Statut */}
            <div className="user-list-hcol--status">
              <span className={`status-badge ${STATUS_CLASS[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </span>
            </div>

            {/* Rôle */}
            <div className="user-list-hcol--role">
              <select
                className="user-role-select"
                value={p.role}
                onChange={e => void onUpdateRole(p.id, e.target.value as UserRole)}
                disabled={isSelf}
                title={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle' : undefined}
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Dernière connexion */}
            <div className="user-last-login user-list-hcol--login">
              {fmtLastLogin(p.last_sign_in_at)}
            </div>

            {/* Actions */}
            <div className="user-actions user-list-hcol--actions">
              {isConfirming ? (
                /* Confirmation de suppression */
                <div className="user-card-confirm">
                  <span className="user-card-confirm-msg">Supprimer&nbsp;?</span>
                  <button
                    className="ua-btn ua-btn--delete"
                    disabled={deleting}
                    onClick={() => void handleDelete(p.id)}
                    title="Confirmer la suppression"
                  >
                    Oui
                  </button>
                  <button
                    className="ua-btn"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Non
                  </button>
                </div>
              ) : (
                <>
                  {/* Modifier — toujours visible */}
                  <button
                    className="ua-btn ua-btn--edit"
                    onClick={() => onEditUser(p)}
                    title="Modifier ce compte"
                  >
                    ✏️ Modifier
                  </button>

                  {!isSelf && (
                    <>
                      {p.status !== 'approved' && (
                        <button
                          className="ua-btn ua-btn--approve"
                          onClick={() => void onUpdateStatus(p.id, 'approved')}
                          title="Approuver"
                        >
                          ✓
                        </button>
                      )}
                      {p.status !== 'rejected' && (
                        <button
                          className="ua-btn ua-btn--reject"
                          onClick={() => void onUpdateStatus(p.id, 'rejected')}
                          title="Refuser"
                        >
                          ✕
                        </button>
                      )}
                      {p.status !== 'pending' && (
                        <button
                          className="ua-btn ua-btn--pending"
                          onClick={() => void onUpdateStatus(p.id, 'pending')}
                          title="Remettre en attente"
                        >
                          ⏸
                        </button>
                      )}
                      {p.status === 'rejected' && (
                        <button
                          className="ua-btn ua-btn--delete"
                          title="Supprimer définitivement"
                          onClick={() => setConfirmDeleteId(p.id)}
                        >
                          🗑
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
