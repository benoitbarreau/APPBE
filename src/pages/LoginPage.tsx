import { LoginForm } from '../components/auth/LoginForm'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Générateur de synoptiques AV</div>
        <h1 className="auth-title">Connexion</h1>
        <LoginForm />
        <p className="auth-switch">
          Pas encore de compte ?{' '}
          <button className="auth-link-btn" onClick={onSwitchToRegister}>
            Créer un compte
          </button>
        </p>
      </div>
    </div>
  )
}
