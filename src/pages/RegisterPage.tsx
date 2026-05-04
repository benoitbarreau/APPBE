import { RegisterForm } from '../components/auth/RegisterForm'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">Générateur de synoptiques AV</div>
        <h1 className="auth-title">Créer un compte</h1>
        <RegisterForm onSuccess={onSwitchToLogin} />
        <p className="auth-switch">
          Déjà un compte ?{' '}
          <button className="auth-link-btn" onClick={onSwitchToLogin}>
            Se connecter
          </button>
        </p>
      </div>
    </div>
  )
}
