import { useEffect, useRef, useState } from 'react'
import { listProjectShares, addProjectShare, removeProjectShare, listApprovedProfiles } from '../lib/projectsApi'
import type { ShareRow, ProfileOption } from '../lib/projectsApi'
import { useAuth } from '../auth/useAuth'

interface Props {
  projectId: string
  projectName: string
  onClose: () => void
}

export function ShareModal({ projectId, projectName, onClose }: Props) {
  const { profile } = useAuth()
  const [shares, setShares] = useState<ShareRow[]>([])
  const [users, setUsers] = useState<ProfileOption[]>([])
  const [sharesLoading, setSharesLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ProfileOption | null>(null)
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Chargement initial : partages en cours + liste des utilisateurs
  useEffect(() => {
    Promise.all([
      listProjectShares(projectId),
      listApprovedProfiles(),
    ]).then(([s, u]) => {
      setShares(s)
      setUsers(u)
    }).catch(e => {
      setError(e instanceof Error ? e.message : 'Erreur chargement')
    }).finally(() => setSharesLoading(false))
  }, [projectId])

  // Fermer le dropdown si clic en dehors
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Utilisateurs déjà partagés (pour les griser dans la liste)
  const sharedUserIds = new Set(shares.map(s => s.user_id))

  // Filtrage de la liste
  const filtered = users.filter(u => {
    if (sharedUserIds.has(u.id)) return false // déjà partagé → masqué
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return u.email.toLowerCase().includes(q) || (u.full_name?.toLowerCase().includes(q) ?? false)
  })

  const handleSelect = (u: ProfileOption) => {
    setSelected(u)
    setSearch(u.full_name ? `${u.full_name} <${u.email}>` : u.email)
    setDropdownOpen(false)
  }

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setSelected(null)
    setDropdownOpen(true)
  }

  const handleAdd = async () => {
    const target = selected ?? (search.trim() ? { id: '', email: search.trim(), full_name: null } : null)
    if (!target) return
    setAdding(true)
    setError(null)
    try {
      await addProjectShare(projectId, target.email, role)
      const updated = await listProjectShares(projectId)
      setShares(updated)
      setSearch('')
      setSelected(null)
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

  const canInvite = !!(selected || search.trim())

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>

        <div className="share-modal-header">
          <h2 className="share-modal-title">Partager le projet</h2>
          <button className="modal-close" onClick={onClose} title="Fermer">✕</button>
        </div>

        <p className="share-modal-subtitle">« {projectName} »</p>

        {/* ── Sélecteur d'utilisateur ── */}
        <div className="share-modal-form" ref={dropdownRef}>
          <div className="share-user-picker">
            <input
              ref={searchRef}
              type="text"
              className="share-modal-email"
              placeholder="Rechercher un utilisateur…"
              value={search}
              autoComplete="off"
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && canInvite) void handleAdd()
                if (e.key === 'Escape') { setDropdownOpen(false); setSearch(''); setSelected(null) }
              }}
            />

            {dropdownOpen && filtered.length > 0 && (
              <div className="share-user-dropdown">
                {filtered.map(u => (
                  <button
                    key={u.id}
                    className="share-user-option"
                    onMouseDown={e => { e.preventDefault(); handleSelect(u) }}
                  >
                    <span className="share-user-option-name">
                      {u.full_name ?? u.email}
                    </span>
                    {u.full_name && (
                      <span className="share-user-option-email">{u.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {dropdownOpen && search.trim() && filtered.length === 0 && (
              <div className="share-user-dropdown">
                <p className="share-user-no-match">
                  {users.length === 0
                    ? 'Aucun autre utilisateur approuvé.'
                    : 'Aucun utilisateur correspondant.'}
                </p>
              </div>
            )}
          </div>

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
            disabled={adding || !canInvite}
          >
            {adding ? '…' : 'Inviter'}
          </button>
        </div>

        {error && <div className="auth-error share-modal-error">{error}</div>}

        {/* ── Liste des partages actifs ── */}
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
