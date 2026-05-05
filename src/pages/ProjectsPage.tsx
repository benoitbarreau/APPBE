import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore } from '../store'
import { listProjects, fetchProject, deleteProject, saveProject } from '../lib/projectsApi'
import type { ProjectRow, VersionMeta } from '../lib/projectsApi'
import { ShareModal } from '../components/ShareModal'
import { AdminSettings } from '../components/AdminSettings'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

interface Props {
  onOpenEditor: () => void
  onOpenAdminDashboard?: () => void
  onOpenVersion?: (versionId: string, projectId: string, projectName: string) => void
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

export function ProjectsPage({ onOpenEditor, onOpenAdminDashboard, onOpenVersion }: Props) {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  // ── Dialog « Nouveau projet » ──
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const newNameInputRef = useRef<HTMLInputElement>(null)

  const loadProjectData = useAppStore(s => s.loadProjectData)
  const resetProject = useAppStore(s => s.resetProject)
  const storeState = useAppStore

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement'))
      .finally(() => setListLoading(false))
  }, [])

  // Focus auto sur l'input quand le dialog s'ouvre
  useEffect(() => {
    if (showNewDialog) {
      setTimeout(() => newNameInputRef.current?.focus(), 50)
    }
  }, [showNewDialog])

  /** Vrai si le projet appartient à l'utilisateur connecté */
  const isOwned = (p: ProjectRow) => p.user_id === profile?.id

  const handleOpen = async (row: ProjectRow) => {
    setLoadingId(row.id)
    setError(null)
    try {
      const { name, data } = await fetchProject(row.id)
      loadProjectData(row.id, name, data, row.versions_meta ?? [])
      onOpenEditor()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'ouverture")
    } finally {
      setLoadingId(null)
    }
  }

  const handleOpenVersionClick = (vm: VersionMeta, row: ProjectRow) => {
    onOpenVersion?.(vm.id, row.id, row.name)
  }

  const fmtVersion = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  const openNewDialog = () => {
    setNewName('')
    setShowNewDialog(true)
  }

  const handleNew = async () => {
    const name = newName.trim() || 'Sans titre'
    setShowNewDialog(false)
    setCreatingNew(true)
    setError(null)
    try {
      const state = storeState.getState()
      const id = await saveProject(null, name, {
        nodes: [],
        cables: [],
        projectMeta: state.projectMeta,
        signals: state.signals,
        zones: state.zones,
        products: state.products,
      })
      resetProject()
      useAppStore.setState({ currentProjectId: id, currentProjectName: name })
      onOpenEditor()
    } catch {
      resetProject()
      useAppStore.setState({ currentProjectName: name })
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
          <button
            className="btn-account"
            onClick={() => setAccountOpen(true)}
            title="Gérer mon compte"
          >
            <span className="btn-account-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="btn-account-name">
              {profile?.full_name ?? profile?.email ?? ''}
            </span>
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
              onClick={openNewDialog}
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
                onClick={openNewDialog}
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
                    {/* ── Contenu principal ── */}
                    <div className="project-card-main">
                      <div className="project-card-body">
                        <div className="project-card-name" title={p.name}>{p.name}</div>
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

                    {/* ── Colonne versions (droite) ── */}
                    <div className="project-card-versions">
                      {!owned && (
                        <span className="project-shared-badge" title="Partagé avec vous">
                          PARTAGÉ
                        </span>
                      )}
                      {(p.versions_meta ?? []).map((vm) => (
                        <button
                          key={vm.id}
                          className="version-badge"
                          title={`Ouvrir la version ${vm.version} — ${fmtVersion(vm.savedAt)}`}
                          onClick={() => handleOpenVersionClick(vm, p)}
                        >
                          {vm.version}
                        </button>
                      ))}
                      {/* Version courante — toujours visible, ouvre en édition */}
                      <button
                        className="version-badge version-badge-current"
                        title="Version en cours — Ouvrir en édition"
                        onClick={() => void handleOpen(p)}
                      >
                        En cours
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── Dialog nouveau projet ── */}
      {showNewDialog && (
        <div className="new-project-dialog-overlay" onClick={() => setShowNewDialog(false)}>
          <div className="new-project-dialog" onClick={e => e.stopPropagation()}>
            <h2>Nouveau projet</h2>
            <input
              ref={newNameInputRef}
              type="text"
              placeholder="Nom du projet…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleNew()
                if (e.key === 'Escape') setShowNewDialog(false)
              }}
              maxLength={80}
            />
            <div className="new-project-dialog-actions">
              <button onClick={() => setShowNewDialog(false)}>Annuler</button>
              <button className="primary" onClick={() => void handleNew()}>
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de partage ── */}
      {shareProject && (
        <ShareModal
          projectId={shareProject.id}
          projectName={shareProject.name}
          onClose={() => setShareProject(null)}
        />
      )}

      {/* ── Modal Mon compte ── */}
      {accountOpen && (
        <AdminSettings onClose={() => setAccountOpen(false)} />
      )}
    </div>
  )
}
