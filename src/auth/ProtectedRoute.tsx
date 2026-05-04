import { useState } from 'react'
import { useAuth } from './useAuth'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { PendingPage } from '../pages/PendingPage'
import { RejectedPage } from '../pages/RejectedPage'
import App from '../App'
import { AdminDashboard } from '../pages/AdminDashboard'

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner" />
      <p>{message}</p>
    </div>
  )
}

export function ProtectedRoute() {
  const { user, profile, loading, signOut } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)

  if (loading) return <LoadingScreen message="Chargement…" />

  if (!user) {
    return showRegister
      ? <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />
      : <LoginPage onSwitchToRegister={() => setShowRegister(true)} />
  }

  if (!profile) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">Générateur de synoptiques AV</div>
          <div className="auth-status-icon">⚠️</div>
          <h1 className="auth-title">Profil introuvable</h1>
          <p className="auth-message">
            Votre compte est authentifié mais aucun profil n'existe en base.<br />
            Contactez un administrateur ou reconnectez-vous.
          </p>
          <button className="auth-btn-secondary" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    )
  }

  if (profile.status === 'pending') return <PendingPage />
  if (profile.status === 'rejected') return <RejectedPage />

  const openAdmin = profile.role === 'admin'
    ? () => setShowAdminDashboard(true)
    : undefined

  return (
    <>
      <App onOpenAdminDashboard={openAdmin} />
      {showAdminDashboard && profile.role === 'admin' && (
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      )}
    </>
  )
}
