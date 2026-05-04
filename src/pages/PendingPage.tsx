import { useAuth } from '../auth/useAuth'

export function PendingPage() {
  const { signOut, profile } = useAuth()
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Générateur de synoptiques AV</div>
        <div className="auth-status-icon">⏳</div>
        <h1 className="auth-title">Compte en attente de validation</h1>
        <p className="auth-message">
          Votre compte (<strong>{profile?.email}</strong>) a bien été créé.
          Un administrateur doit valider votre accès avant que vous puissiez utiliser l'application.
        </p>
        <button className="auth-btn-secondary" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
