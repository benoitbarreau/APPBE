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
  const { user, profile, loading } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)

  if (loading) return <LoadingScreen message="Chargement…" />

  if (!user) {
    return showRegister
      ? <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />
      : <LoginPage onSwitchToRegister={() => setShowRegister(true)} />
  }

  if (!profile) return <LoadingScreen message="Chargement du profil…" />

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
