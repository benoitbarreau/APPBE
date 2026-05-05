import { useEffect, useState } from 'react'
import { listProjectShares, addProjectShare, removeProjectShare } from '../lib/projectsApi'
import type { ShareRow } from '../lib/projectsApi'
import { useAuth } from '../auth/useAuth'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export function ShareModal({ projectId, projectName, onClose }: Props) {
  const { profile } = useAuth()
  const [shares, setShares] = useState<ShareRow[]>([])
  const [sharesLoading, setSharesLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProjectShares(projectId)
      .then(setShares)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement'))
      .finally(() => setSharesLoading(false))
  }, [projectId])

  const handleAdd = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    setAdding(true)
    setError(null)
    try {
      await addProjectShare(projectId, trimmed, role)
      const updated = await listProjectShares(projectId)
      setShares(updated)
      setEmail('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du partage')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (shareId: string) => {
    setRemovingId(shareId)
    setError(null)
    try {
      await removeProjectShare(shareId)
      setShares(s => s.filter(x => x.id !== shareId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la révocation')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>

        <div className="share-modal-header">
          <h2 className="share-modal-title">Partager le projet</h2>
          <button className="modal-close" onClick={onClose} title="Fermer">✕</button>
        </div>

        <p className="share-modal-subtitle">« {projectName} »</p>

        {/* Formulaire d'invitation */}
        <div className="share-modal-form">
          <input
            type="email"
            className="share-modal-email"
            placeholder="Email du collaborateur…"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleAdd() }}
            autoFocus
          />
          <select
            className="share-modal-role"
            value={role}
            onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
            title="Niveau d'accès"
          >
            <option value="viewer">Lecteur</option>
            <option value="editor">Éditeur</option>
          </select>
          <button
            className="primary"
            onClick={() => void handleAdd()}
            disabled={adding || !email.trim()}
          >
            {adding ? '…' : 'Inviter'}
          </button>
        </div>

        {error && <div className="auth-error share-modal-error">{error}</div>}

        {/* Liste des partages en cours */}
        <div className="share-list">
          <p className="share-list-heading">Accès actuels</p>

          {sharesLoading && <p className="share-list-empty">Chargement…</p>}

          {!sharesLoading && shares.length === 0 && (
            <p className="share-list-empty">Aucun partage pour l'instant.</p>
          )}

          {shares.map(s => (
            <div key={s.id} className="share-list-item">
              <div className="share-list-user">
                <span className="share-list-name">
                  {s.profiles?.full_name || s.profiles?.email || s.user_id}
                </span>
                {s.profiles?.full_name && (
                  <span className="share-list-email-sub">{s.profiles.email}</span>
                )}
              </div>
              <div className="share-list-right">
                <span className={`share-role-badge share-role-${s.role}`}>
                  {s.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                </span>
                <button
                  className="share-remove-btn"
                  onClick={() => void handleRemove(s.id)}
                  disabled={removingId === s.id}
                  title="Révoquer l'accès"
                >
                  {removingId === s.id ? '…' : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="share-modal-footer">
          Propriétaire : <strong>{profile?.full_name ?? profile?.email ?? '—'}</strong>
        </p>

      </div>
    </div>
  )
}
