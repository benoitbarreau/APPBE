import { useAuth } from '../auth/useAuth'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

export function PendingPage() {
  const { signOut, profile } = useAuth()
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={logoUrl} alt="SynoX" className="auth-logo" />
        <p className="auth-hero-sub">Générateur de synoptiques Audiovisuel</p>
      </div>
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-card-icon" style={{ fontSize: '22px' }}>⏳</div>
          <h1 className="auth-card-title">Compte en attente</h1>
          <p className="auth-card-subtitle">Validation d'accès requise</p>
        </div>
        <p className="auth-message">
          Votre compte (<strong style={{ color: '#e5e7eb' }}>{profile?.email}</strong>) a bien été créé.<br /><br />
          Un administrateur doit valider votre accès avant que vous puissiez utiliser l'application.
        </p>
        <button className="auth-btn-secondary" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
