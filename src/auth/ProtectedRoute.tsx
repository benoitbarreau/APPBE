import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useAppStore, useCatalogMeta, useEditorState } from '../store'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PendingPage } from '../pages/PendingPage'
import { RejectedPage } from '../pages/RejectedPage'
import { ProjectsPage } from '../pages/ProjectsPage'
import App from '../App'
import { AdminDashboard } from '../pages/AdminDashboard'
import { ReferentielPage } from '../pages/ReferentielPage'
import { CataloguePage } from '../pages/CataloguePage'
import { HomePage } from '../pages/HomePage'
import { fetchUserProducts } from '../lib/userProductsApi'
import { fetchUserSignals, fetchUserZones } from '../lib/userSignalsZonesApi'
import { fetchBrands, fetchCategories } from '../lib/catalogMetaApi'
import { fetchProject, fetchProjectVersion, saveProject } from '../lib/projectsApi'
import { linkProjectToRoom } from '../lib/referentielApi'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>{message}</p>
    </div>
  )
}

/** Écran d'erreur d'initialisation avec actions de récupération. */
function InitErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string
  onRetry: () => void
  onSignOut: () => void
}) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={logoUrl} alt="SynoX" className="auth-logo" />
      </div>
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-card-icon" style={{ fontSize: '22px' }}>⚠️</div>
          <h1 className="auth-card-title">Démarrage impossible</h1>
          <p className="auth-card-subtitle">
            Une erreur est survenue à l'initialisation
          </p>
        </div>
        <p className="auth-message" style={{ whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="auth-btn-primary" onClick={onRetry}>
            🔄 Réessayer
          </button>
          <button className="auth-btn-secondary" onClick={onSignOut}>
            Se reconnecter
          </button>
        </div>
        <p className="muted" style={{ marginTop: 16, fontSize: 11, textAlign: 'center' }}>
          Si le problème persiste, fermez cet onglet, rouvrez-le, et reconnectez-vous.
        </p>
      </div>
    </div>
  )
}

type Page = 'home' | 'projects' | 'editor' | 'referentiel' | 'catalogue'

/** Persistance de la dernière vue active pour survivre à un F5 / fermeture
 *  de navigateur. On stocke aussi le userId pour ne PAS restaurer l'éditeur
 *  d'un autre compte si quelqu'un se connecte sur le même navigateur. */
const SESSION_VIEW_KEY = 'synox.session.view'

interface PersistedView {
  userId: string
  page: Page
  readOnly: boolean
  readOnlyVersion?: string
}
function loadPersistedView(): PersistedView | null {
  try {
    const raw = localStorage.getItem(SESSION_VIEW_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as PersistedView
    if (!v || (v.page !== 'home' && v.page !== 'projects' && v.page !== 'editor' && v.page !== 'referentiel' && v.page !== 'catalogue')) return null
    return v
  } catch {
    return null
  }
}
function savePersistedView(v: PersistedView) {
  try {
    localStorage.setItem(SESSION_VIEW_KEY, JSON.stringify(v))
  } catch {
    // localStorage indisponible : la persistance échoue silencieusement
  }
}
function clearPersistedView() {
  try {
    localStorage.removeItem(SESSION_VIEW_KEY)
  } catch {
    // ignoré
  }
}

export function ProtectedRoute() {
  const { user, profile, loading, signOut, initError, retry } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [page, setPage] = useState<Page>('home')
  const [readOnlyVersion, setReadOnlyVersion] = useState<string | undefined>()
  /** ID client à ouvrir automatiquement lors de la prochaine navigation vers le référentiel. */
  const [refInitClientId, setRefInitClientId] = useState<string | null>(null)
  const setReadOnly = useEditorState((s) => s.setReadOnly)
  const readOnly = useEditorState((s) => s.readOnly)
  /** Évite de re-restaurer la vue à chaque changement de user (n'arme qu'une fois par session) */
  const hasRestoredRef = useRef(false)

  /** Vrai si loading=false a été observé alors que user=null.
   *  Cela indique que le formulaire de login a été affiché → c'est un vrai login.
   *  Sur un simple F5, le bootstrap charge la session pendant que loading=true,
   *  donc cet état intermédiaire n'est jamais atteint. */
  const loginWaitedRef = useRef(false)

  const clearForUser = useAppStore(s => s.clearForUser)
  const mergeUserProducts = useAppStore(s => s.mergeUserProducts)
  const mergeUserSignals = useAppStore(s => s.mergeUserSignals)
  const mergeUserZones = useAppStore(s => s.mergeUserZones)
  const setCatalogMeta = useCatalogMeta(s => s.setCatalogMeta)
  const loadProjectData = useAppStore(s => s.loadProjectData)

  // Détecte le moment où le formulaire de login est affiché (loading=false, user=null).
  // Cela ne se produit PAS sur un F5 (le bootstrap charge la session pendant loading=true).
  useEffect(() => {
    if (!loading && !user) {
      loginWaitedRef.current = true
    }
  }, [loading, user])

  // Sécurité : isoler les données du store par utilisateur.
  useEffect(() => {
    if (user) clearForUser(user.id)
  }, [user, clearForUser])

  // ── Restauration de la vue après F5 / réouverture navigateur ─────────
  // Si l'utilisateur était dans l'éditeur d'un projet et qu'il rafraîchit,
  // on revient sur ce projet plutôt que sur la liste — sinon il perd
  // son travail non sauvegardé (le store Zustand persiste déjà nodes,
  // cables, tabs, etc. dans localStorage).
  useEffect(() => {
    // Réinitialiser le drapeau si on n'est pas (ou plus) éligible : permet
    // à un autre utilisateur qui se connecte sur le même onglet de bénéficier
    // de SA propre restauration.
    if (!user || profile?.status !== 'approved') {
      hasRestoredRef.current = false
      return
    }
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true

    // Distinguer un vrai login d'un rafraîchissement de page (F5).
    // loginWaitedRef est true si le formulaire de login a été affiché avant que user apparaisse.
    // Sur un F5, le bootstrap charge la session pendant loading=true → cet état n'est jamais atteint.
    const isFreshLogin = loginWaitedRef.current
    loginWaitedRef.current = false // consommer le flag

    if (isFreshLogin) {
      // Vrai login → toujours aller à la page d'accueil, ignorer la vue persistée
      clearPersistedView()
      return
    }

    const saved = loadPersistedView()
    if (!saved || saved.userId !== user.id) {
      // Vue d'un autre utilisateur ou aucune sauvegarde → page d'accueil
      clearPersistedView()
      return
    }
    if (saved.page === 'editor') {
      // On vérifie que le store contient bien un projet ouvert avant
      // de basculer en mode éditeur — sinon on resterait sur un éditeur
      // vide et le bouton "Retour aux projets" serait la seule issue.
      const storeState = useAppStore.getState()
      if (!storeState.currentProjectId || storeState.tabs.length === 0) {
        clearPersistedView()
        return
      }
      setPage('editor')
      setReadOnly(saved.readOnly)
      setReadOnlyVersion(saved.readOnlyVersion)
    } else if (saved.page === 'projects' || saved.page === 'referentiel' || saved.page === 'catalogue') {
      setPage(saved.page)
    }
  }, [user?.id, profile?.status, setReadOnly])

  /** Sauvegarde explicite de la vue. Appelée dans les handlers de
   *  navigation, jamais via un useEffect basé sur des deps : évite la
   *  race où l'effet écraserait la vue persistée juste avant que la
   *  restauration n'ait pu agir au tout premier render. */
  const persistView = (p: Page, ro: boolean, rov?: string) => {
    if (!user) return
    savePersistedView({ userId: user.id, page: p, readOnly: ro, readOnlyVersion: rov })
  }

  // Chargement depuis Supabase après connexion : produits, signaux, zones, catalogue.
  // Se re-déclenche si user.id ou profile.status changent (ex: approbation).
  useEffect(() => {
    if (!user || profile?.status !== 'approved') return
    fetchUserProducts()
      .then(rows => { if (rows.length > 0) mergeUserProducts(rows) })
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

  // Revenir à la page d'accueil si la session expire ou si l'utilisateur se déconnecte.
  // loginWaitedRef sera remis à true naturellement quand loading=false + user=null
  // sera observé après le logout (voir l'effet ci-dessus).
  useEffect(() => {
    if (!user) {
      setPage('home')
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
      persistView('editor', true, version)
    } catch (e) {
      alert("Impossible de charger cette version : " + (e instanceof Error ? e.message : String(e)))
    }
  }

  /** Ouvre la version courante — éditeur complet ou mode lecteur selon le rôle partagé */
  const handleOpenEditor = (readOnly = false, label?: string) => {
    setReadOnly(readOnly)
    setReadOnlyVersion(label)
    setPage('editor')
    persistView('editor', readOnly, label)
  }

  /** Retour à la liste — utilisé par App.onBackToProjects */
  const handleBackToProjects = () => {
    setReadOnly(false)
    setReadOnlyVersion(undefined)
    setPage('projects')
    persistView('projects', false)
  }

  const handleGoHome = () => {
    setPage('home')
    persistView('home', false)
  }

  const handleOpenReferentiel = () => {
    setRefInitClientId(null)
    setPage('referentiel')
    persistView('referentiel', false)
  }

  const handleOpenCatalogue = () => {
    setPage('catalogue')
    persistView('catalogue', false)
  }

  const handleGoToReferentiel = (clientId: string) => {
    setRefInitClientId(clientId)
    setPage('referentiel')
    persistView('referentiel', false)
  }

  const handleBackToProjectsFromRef = () => {
    setRefInitClientId(null)
    setPage('projects')
    persistView('projects', false)
  }

  const handleNewProjectFromRoom = async (roomId: string, projectName: string, siteName: string, clientName: string) => {
    const state = useAppStore.getState()
    try {
      const id = await saveProject(null, projectName, {
        projectMeta: { ...state.projectMeta, client: clientName, lieu: siteName },
        signals: state.signals,
        zones: state.zones,
        products: state.products,
      })
      await linkProjectToRoom(id, roomId)
      useAppStore.setState({ currentProjectId: id, currentProjectName: projectName })
      setReadOnly(false)
      setReadOnlyVersion(undefined)
      setPage('editor')
      persistView('editor', false)
    } catch (e) {
      alert('Erreur création projet : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  /** Ouvre un projet existant depuis le Référentiel */
  const handleOpenProjectFromRef = async (projectId: string, projectName: string) => {
    try {
      const { data } = await fetchProject(projectId)
      loadProjectData(projectId, projectName, data, [])
      setReadOnly(false)
      setReadOnlyVersion(undefined)
      setPage('editor')
      persistView('editor', false)
    } catch (e) {
      alert('Impossible d\'ouvrir le projet : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // ── Erreur fatale d'initialisation (timeout, session corrompue, …) ─────
  // Prioritaire sur tout le reste pour ne JAMAIS rester sur "Chargement…"
  if (initError) {
    return (
      <InitErrorScreen
        message={initError}
        onRetry={retry}
        onSignOut={() => void signOut()}
      />
    )
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
      {page === 'home' && (
        <HomePage
          onOpenProjects={() => { setPage('projects'); persistView('projects', false) }}
          onOpenReferentiel={handleOpenReferentiel}
          onOpenCatalogue={handleOpenCatalogue}
          onOpenAdminDashboard={openAdmin}
        />
      )}

      {page === 'projects' && (
        <ProjectsPage
          onOpenEditor={handleOpenEditor}
          onOpenAdminDashboard={openAdmin}
          onOpenVersion={handleOpenVersion}
          onOpenReferentiel={handleOpenReferentiel}
          onGoHome={handleGoHome}
        />
      )}

      {page === 'editor' && (
        <App
          onOpenAdminDashboard={openAdmin}
          onBackToProjects={handleBackToProjects}
          onGoToReferentiel={handleGoToReferentiel}
          readOnly={readOnly}
          readOnlyVersion={readOnlyVersion}
        />
      )}

      {page === 'referentiel' && (
        <ReferentielPage
          onOpenProjects={handleBackToProjectsFromRef}
          onOpenAdminDashboard={openAdmin}
          onNewProjectFromRoom={handleNewProjectFromRoom}
          onOpenProject={handleOpenProjectFromRef}
          onGoHome={handleGoHome}
          initialClientId={refInitClientId}
        />
      )}

      {page === 'catalogue' && (
        <CataloguePage
          onGoHome={handleGoHome}
          onOpenAdminDashboard={openAdmin}
        />
      )}

      {showAdminDashboard && profile.role === 'admin' && (
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      )}
    </>
  )
}
