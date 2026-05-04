import { useAuth } from '../auth/useAuth'

export function RejectedPage() {
  const { signOut, profile } = useAuth()
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Générateur de synoptiques AV</div>
        <div className="auth-status-icon auth-status-rejected">✕</div>
        <h1 className="auth-title">Accès refusé</h1>
        <p className="auth-message">
          L'accès du compte <strong>{profile?.email}</strong> a été refusé.
          Contactez un administrateur pour plus d'informations.
        </p>
        <button className="auth-btn-secondary" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
