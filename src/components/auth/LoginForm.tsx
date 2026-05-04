import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'
import { supabase } from '../../lib/supabase'

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  )
}

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

export function LoginForm() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const sendReset = async (e: FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      })
    } finally {
      setForgotLoading(false)
      setForgotSent(true)
    }
  }

  if (showForgot) {
    if (forgotSent) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="auth-success">
            Si ce compte existe, un email de réinitialisation a été envoyé.
          </div>
          <button
            className="auth-btn-secondary"
            style={{ width: '100%' }}
            onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail('') }}
          >
            ← Retour à la connexion
          </button>
        </div>
      )
    }
    return (
      <form className="auth-form" onSubmit={e => void sendReset(e)}>
        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>
        <div className="auth-field">
          <label>Email</label>
          <div className="auth-input-wrap">
            <span className="auth-input-icon"><IconMail /></span>
            <input
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="vous@exemple.fr"
              autoFocus
            />
          </div>
        </div>
        <button type="submit" className="auth-btn-primary" disabled={forgotLoading}>
          {forgotLoading ? 'Envoi…' : 'Envoyer le lien'}
        </button>
        <button
          type="button"
          className="auth-btn-secondary"
          style={{ width: '100%', marginTop: '-4px' }}
          onClick={() => setShowForgot(false)}
        >
          ← Retour à la connexion
        </button>
      </form>
    )
  }

  return (
    <form className="auth-form" onSubmit={e => void submit(e)}>
      <div className="auth-field">
        <label>Email</label>
        <div className="auth-input-wrap">
          <span className="auth-input-icon"><IconMail /></span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="votre@email.com"
          />
        </div>
      </div>
      <div className="auth-field">
        <div className="auth-field-header">
          <label>Mot de passe</label>
          <button type="button" className="auth-field-forgot" onClick={() => { setShowForgot(true); setForgotEmail(email) }}>
            Oublié ?
          </button>
        </div>
        <div className="auth-input-wrap">
          <span className="auth-input-icon"><IconLock /></span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" className="auth-btn-primary" disabled={loading}>
        {loading ? 'Connexion…' : <>Se connecter →</>}
      </button>
    </form>
  )
}
