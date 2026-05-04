import { RegisterForm } from '../components/auth/RegisterForm'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={logoUrl} alt="SynoX" className="auth-logo" />
        <p className="auth-hero-sub">Générateur de synoptiques Audiovisuel</p>
      </div>

      <div className="auth-card">
        <div className="auth-card-header">
          <div className="auth-card-icon">✚</div>
          <h1 className="auth-card-title">Créer un compte</h1>
          <p className="auth-card-subtitle">Rejoignez votre espace SynoX</p>
        </div>

        <RegisterForm onSuccess={onSwitchToLogin} />

        <div className="auth-divider" />
        <p className="auth-switch">
          Déjà un compte ?{' '}
          <button className="auth-link-btn" onClick={onSwitchToLogin}>
            Se connecter
          </button>
        </p>
      </div>

      <p className="auth-footer">
        En continuant, vous acceptez nos{' '}
        <a href="#">Conditions d'Utilisation</a> et notre{' '}
        <a href="#">Politique de Confidentialité</a>.
      </p>
    </div>
  )
}
