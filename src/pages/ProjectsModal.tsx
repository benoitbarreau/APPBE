import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore } from '../store'
import { listProjects, fetchProject, deleteProject } from '../lib/projectsApi'
import type { ProjectRow } from '../lib/projectsApi'

interface Props {
  onClose: () => void
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

export function ProjectsModal({ onClose }: Props) {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentProjectId = useAppStore(s => s.currentProjectId)
  const loadProjectData = useAppStore(s => s.loadProjectData)

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setListLoading(false))
  }, [])

  const handleLoad = async (row: ProjectRow) => {
    if (row.id === currentProjectId) { onClose(); return }
    setLoadingId(row.id)
    setError(null)
    try {
      const { name, data } = await fetchProject(row.id)
      loadProjectData(row.id, name, data)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce projet ? Cette action est irréversible.')) return
    setDeletingId(id)
    try {
      await deleteProject(id)
      setProjects(p => p.filter(x => x.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal projects-modal">
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '16px' }}>
            {profile?.role === 'admin' ? 'Tous les projets' : 'Mes projets'}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

          {listLoading && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
              Chargement…
            </p>
          )}

          {!listLoading && projects.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>
              Aucun projet sauvegardé.<br />
              <span style={{ fontSize: '12px' }}>
                Utilisez le bouton <strong>Sauvegarder</strong> pour enregistrer votre premier projet.
              </span>
            </p>
          )}

          {!listLoading && projects.length > 0 && (
            <table className="user-table">
              <thead>
                <tr>
                  <th>Nom du projet</th>
                  {profile?.role === 'admin' && <th>Propriétaire</th>}
                  <th>Modifié le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.id === currentProjectId && (
                        <span className="status-badge status-approved" style={{ marginLeft: 8 }}>
                          Ouvert
                        </span>
                      )}
                    </td>
                    {profile?.role === 'admin' && (
                      <td style={{ color: 'var(--muted)', fontSize: '12px' }}>
                        {p.profiles?.full_name ?? p.profiles?.email ?? '—'}
                      </td>
                    )}
                    <td style={{ color: 'var(--muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {fmt(p.updated_at)}
                    </td>
                    <td>
                      <div className="user-table-actions">
                        <button
                          onClick={() => void handleLoad(p)}
                          disabled={loadingId === p.id || p.id === currentProjectId}
                        >
                          {loadingId === p.id ? '…' : 'Ouvrir'}
                        </button>
                        <button
                          className="danger"
                          onClick={() => void handleDelete(p.id)}
                          disabled={deletingId === p.id}
                        >
                          {deletingId === p.id ? '…' : 'Supprimer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
