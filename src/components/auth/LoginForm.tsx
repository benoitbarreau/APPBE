import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'

export function LoginForm() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <form className="auth-form" onSubmit={e => void submit(e)}>
      <div className="auth-field">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="vous@exemple.fr"
        />
      </div>
      <div className="auth-field">
        <label>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" className="auth-btn-primary" disabled={loading}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
