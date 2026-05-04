import { useAuth } from '../auth/useAuth'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

export function RejectedPage() {
  const { signOut, profile } = useAuth()
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={logoUrl} alt="SynoX" className="auth-logo" />
        <p className="auth-hero-sub">Générateur de synoptiques Audiovisuel</p>
      </div>
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-card-icon auth-status-rejected" style={{ fontSize: '22px' }}>✕</div>
          <h1 className="auth-card-title">Accès refusé</h1>
          <p className="auth-card-subtitle">Votre demande n'a pas été acceptée</p>
        </div>
        <p className="auth-message">
          L'accès du compte <strong style={{ color: '#e5e7eb' }}>{profile?.email}</strong> a été refusé.<br /><br />
          Contactez un administrateur pour plus d'informations.
        </p>
        <button className="auth-btn-secondary" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
