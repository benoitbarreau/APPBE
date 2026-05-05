import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore } from '../store'
import { listProjects, fetchProject, deleteProject, saveProject } from '../lib/projectsApi'
import type { ProjectRow } from '../lib/projectsApi'
import { ShareModal } from '../components/ShareModal'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

interface Props {
  onOpenEditor: () => void
  onOpenAdminDashboard?: () => void
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

export function ProjectsPage({ onOpenEditor, onOpenAdminDashboard }: Props) {
  const { profile, signOut } = useAuth()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null)

  const loadProjectData = useAppStore(s => s.loadProjectData)
  const resetProject = useAppStore(s => s.resetProject)
  const storeState = useAppStore

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement'))
      .finally(() => setListLoading(false))
  }, [])

  /** Vrai si le projet appartient à l'utilisateur connecté */
  const isOwned = (p: ProjectRow) => p.user_id === profile?.id

  const handleOpen = async (row: ProjectRow) => {
    setLoadingId(row.id)
    setError(null)
    try {
      const { name, data } = await fetchProject(row.id)
      loadProjectData(row.id, name, data)
      onOpenEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'ouverture")
    } finally {
      setLoadingId(null)
    }
  }

  const handleNew = async () => {
    setCreatingNew(true)
    setError(null)
    try {
      const state = storeState.getState()
      const id = await saveProject(null, 'Sans titre', {
        nodes: [],
        cables: [],
        projectMeta: state.projectMeta,
        signals: state.signals,
        zones: state.zones,
        products: state.products,
      })
      resetProject()
      useAppStore.setState({ currentProjectId: id, currentProjectName: 'Sans titre' })
      onOpenEditor()
    } catch {
      // En cas d'erreur réseau, ouvrir quand même l'éditeur sans ID cloud
      resetProject()
      onOpenEditor()
    } finally {
      setCreatingNew(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce projet définitivement ? Cette action est irréversible.')) return
    setDeletingId(id)
    setError(null)
    try {
      await deleteProject(id)
      setProjects(p => p.filter(x => x.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="projects-page">
      {/* ── Header ── */}
      <header className="projects-page-header">
        <div className="projects-page-brand">
          <img src={logoUrl} alt="SynoX" className="projects-page-logo" />
          <span className="projects-page-title">SynoX</span>
        </div>
        <div className="projects-page-user">
          {profile?.role === 'admin' && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <span className="projects-page-username" title={profile?.email ?? ''}>
            {profile?.full_name ?? profile?.email ?? ''}
          </span>
          <button onClick={() => void signOut()} className="btn-signout">
            Se déconnecter
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="projects-page-main">
        <div className="projects-page-container">

          {/* Top bar */}
          <div className="projects-page-topbar">
            <div>
              <h1 className="projects-page-heading">
                {profile?.role === 'admin' ? 'Tous les projets' : 'Mes projets'}
              </h1>
              <p className="projects-page-sub">
                {listLoading
                  ? 'Chargement…'
                  : `${projects.length} projet${projects.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              className="primary projects-page-new"
              onClick={() => void handleNew()}
              disabled={creatingNew}
            >
              {creatingNew ? '…' : '+ Nouveau projet'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!listLoading && projects.length === 0 && (
            <div className="projects-page-empty">
              <div className="projects-page-empty-icon">📋</div>
              <p>Aucun projet pour l'instant.</p>
              <button
                className="primary"
                onClick={() => void handleNew()}
                disabled={creatingNew}
              >
                {creatingNew ? '…' : 'Créer votre premier projet'}
              </button>
            </div>
          )}

          {/* Grid */}
          {projects.length > 0 && (
            <div className="projects-grid">
              {projects.map(p => {
                const owned = isOwned(p)
                return (
                  <div key={p.id} className={`project-card${owned ? '' : ' project-card-shared'}`}>
                    <div className="project-card-body">
                      <div className="project-card-name-row">
                        <div className="project-card-name" title={p.name}>{p.name}</div>
                        {!owned && (
                          <span className="project-shared-badge" title="Partagé avec vous">
                            Partagé
                          </span>
                        )}
                      </div>
                      {profile?.role === 'admin' && p.profiles && (
                        <div className="project-card-owner">
                          {p.profiles.full_name ?? p.profiles.email}
                        </div>
                      )}
                      {!owned && p.profiles && (
                        <div className="project-card-owner">
                          Par {p.profiles.full_name ?? p.profiles.email}
                        </div>
                      )}
                      <div className="project-card-date">
                        Modifié le {fmt(p.updated_at)}
                      </div>
                    </div>
                    <div className="project-card-actions">
                      <button
                        className="primary"
                        onClick={() => void handleOpen(p)}
                        disabled={loadingId === p.id}
                      >
                        {loadingId === p.id ? '…' : 'Ouvrir →'}
                      </button>
                      {owned && (
                        <>
                          <button
                            className="btn-share"
                            onClick={() => setShareProject({ id: p.id, name: p.name })}
                            title="Partager ce projet"
                          >
                            ↗ Partager
                          </button>
                          <button
                            className="danger"
                            onClick={() => void handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            title="Supprimer ce projet"
                          >
                            {deletingId === p.id ? '…' : '🗑'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── Modal de partage ── */}
      {shareProject && (
        <ShareModal
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
        />
      )}
    </div>
  )
}
