import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useAppStore, useCatalogMeta, useEditorState } from '../store'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PendingPage } from '../pages/PendingPage'
import { RejectedPage } from '../pages/RejectedPage'
import { ProjectsPage } from '../pages/ProjectsPage'
import App from '../App'
import { AdminDashboard } from '../pages/AdminDashboard'
import { fetchUserProducts } from '../lib/userProductsApi'
import { fetchUserSignals, fetchUserZones } from '../lib/userSignalsZonesApi'
import { fetchBrands, fetchCategories } from '../lib/catalogMetaApi'
import { fetchProjectVersion } from '../lib/projectsApi'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>{message}</p>
    </div>
  )
}

type Page = 'projects' | 'editor'

export function ProtectedRoute() {
  const { user, profile, loading, signOut } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [page, setPage] = useState<Page>('projects')
  const [readOnlyVersion, setReadOnlyVersion] = useState<string | undefined>()
  const setReadOnly = useEditorState((s) => s.setReadOnly)
  const readOnly = useEditorState((s) => s.readOnly)

  const clearForUser = useAppStore(s => s.clearForUser)
  const mergeUserProducts = useAppStore(s => s.mergeUserProducts)
  const mergeUserSignals = useAppStore(s => s.mergeUserSignals)
  const mergeUserZones = useAppStore(s => s.mergeUserZones)
  const setCatalogMeta = useCatalogMeta(s => s.setCatalogMeta)
  const loadProjectData = useAppStore(s => s.loadProjectData)

  // Sécurité : isoler les données du store par utilisateur.
  useEffect(() => {
    if (user) clearForUser(user.id)
  }, [user, clearForUser])

  // Chargement depuis Supabase après connexion : produits, signaux, zones, catalogue.
  // Se re-déclenche si user.id ou profile.status changent (ex: approbation).
  useEffect(() => {
    if (!user || profile?.status !== 'approved') return
    fetchUserProducts()
      .then(ps => { if (ps.length > 0) mergeUserProducts(ps) })
      .catch(() => { /* échec silencieux — le localStorage fait office de fallback */ })
    fetchUserSignals()
      .then(sigs => { if (Object.keys(sigs).length > 0) mergeUserSignals(sigs) })
      .catch(() => { /* échec silencieux */ })
    fetchUserZones()
      .then(zones => { if (zones.length > 0) mergeUserZones(zones) })
      .catch(() => { /* échec silencieux */ })
    Promise.all([fetchBrands(), fetchCategories()])
      .then(([brands, categories]) => setCatalogMeta(brands, categories))
      .catch(() => { /* échec silencieux */ })
  }, [user?.id, profile?.status, mergeUserProducts, mergeUserSignals, mergeUserZones, setCatalogMeta])

  // Revenir à la page projets si la session expire
  useEffect(() => {
    if (!user) {
      setPage('projects')
      setShowAdminDashboard(false)
      setShowRegister(false)
      setReadOnly(false)
      setReadOnlyVersion(undefined)
    }
  }, [user])

  /** Ouvre une version archivée en lecture seule */
  const handleOpenVersion = async (versionId: string, projectId: string, projectName: string) => {
    try {
      const { version, data } = await fetchProjectVersion(versionId)
      loadProjectData(projectId, projectName, data, [])
      setReadOnly(true)
      setReadOnlyVersion(version)
      setPage('editor')
    } catch (e) {
      alert("Impossible de charger cette version : " + (e instanceof Error ? e.message : String(e)))
    }
  }

  /** Ouvre la version courante (normale, éditable) */
  const handleOpenEditor = () => {
    setReadOnly(false)
    setReadOnlyVersion(undefined)
    setPage('editor')
  }

  // ── Chargement initial ──────────────────────────────────────────────────
  if (loading) return <LoadingScreen message="Chargement…" />

  // ── Non authentifié ─────────────────────────────────────────────────────
  if (!user) {
    return showRegister
      ? <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />
      : <LoginPage onSwitchToRegister={() => setShowRegister(true)} />
  }

  // ── Profil absent (affiché seulement si vraiment absent après 3 tentatives) ──
  if (!profile) {
    return (
      <div className="auth-page">
        <div className="auth-hero">
          <img src={logoUrl} alt="SynoX" className="auth-logo" />
        </div>
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-card-icon" style={{ fontSize: '22px' }}>⚠️</div>
            <h1 className="auth-card-title">Profil introuvable</h1>
            <p className="auth-card-subtitle">Un problème est survenu</p>
          </div>
          <p className="auth-message">
            Votre compte est authentifié mais aucun profil n'existe en base.<br /><br />
            Contactez un administrateur ou reconnectez-vous.
          </p>
          <button className="auth-btn-secondary" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  // ── Statuts de compte ────────────────────────────────────────────────────
  if (profile.status === 'pending') return <PendingPage />
  if (profile.status === 'rejected') return <RejectedPage />

  // ── Compte approuvé ──────────────────────────────────────────────────────
  const openAdmin = profile.role === 'admin'
    ? () => setShowAdminDashboard(true)
    : undefined

  return (
    <>
      {page === 'projects' && (
        <ProjectsPage
          onOpenEditor={handleOpenEditor}
          onOpenAdminDashboard={openAdmin}
          onOpenVersion={handleOpenVersion}
        />
      )}

      {page === 'editor' && (
        <App
          onOpenAdminDashboard={openAdmin}
          onBackToProjects={() => { setReadOnly(false); setReadOnlyVersion(undefined); setPage('projects') }}
          readOnly={readOnly}
          readOnlyVersion={readOnlyVersion}
        />
      )}

      {showAdminDashboard && profile.role === 'admin' && (
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      )}
    </>
  )
}
