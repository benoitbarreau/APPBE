import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useAppStore } from '../store'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PendingPage } from '../pages/PendingPage'
import { RejectedPage } from '../pages/RejectedPage'
import { ProjectsPage } from '../pages/ProjectsPage'
import App from '../App'
import { AdminDashboard } from '../pages/AdminDashboard'
import { fetchUserProducts } from '../lib/userProductsApi'

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

  const clearForUser = useAppStore(s => s.clearForUser)
  const mergeUserProducts = useAppStore(s => s.mergeUserProducts)

  // Sécurité : isoler les données du store par utilisateur.
  useEffect(() => {
    if (user) clearForUser(user.id)
  }, [user, clearForUser])

  // Chargement des produits custom depuis Supabase après connexion.
  // Se re-déclenche si user.id ou profile.status changent (ex: approbation).
  useEffect(() => {
    if (!user || profile?.status !== 'approved') return
    fetchUserProducts()
      .then(ps => { if (ps.length > 0) mergeUserProducts(ps) })
      .catch(() => { /* échec silencieux — le localStorage fait office de fallback */ })
  }, [user?.id, profile?.status, mergeUserProducts])

  // Revenir à la page projets si la session expire
  useEffect(() => {
    if (!user) {
      setPage('projects')
      setShowAdminDashboard(false)
      setShowRegister(false)
    }
  }, [user])

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
          onOpenEditor={() => setPage('editor')}
          onOpenAdminDashboard={openAdmin}
        />
      )}

      {page === 'editor' && (
        <App
          onOpenAdminDashboard={openAdmin}
          onBackToProjects={() => setPage('projects')}
        />
      )}

      {showAdminDashboard && profile.role === 'admin' && (
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      )}
    </>
  )
}
