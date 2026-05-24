import { LoginForm } from '../components/auth/LoginForm'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-hero">
        <img src={logoUrl} alt="SynoX" className="auth-logo" />
      </div>

      <div className="auth-card">
        <div className="auth-card-header">
          <p className="auth-card-subtitle">Connectez-vous à votre espace SynoX</p>
        </div>

        <LoginForm />

        <div className="auth-divider" />
        <p className="auth-switch">
          Vous n'avez pas encore de compte ?{' '}
          <button className="auth-link-btn" onClick={onSwitchToRegister}>
            Inscrivez-vous
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
