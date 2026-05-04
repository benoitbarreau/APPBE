import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../../auth/useAuth'

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const { signUp } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password, `${firstName.trim()} ${lastName.trim()}`)
      setSuccess(true)
      setTimeout(onSuccess, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création du compte")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-success">
        Compte créé. Un administrateur devra valider votre accès.
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={e => void submit(e)}>
      <div className="auth-field-row">
        <div className="auth-field">
          <label>Prénom</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
            placeholder="Jean"
          />
        </div>
        <div className="auth-field">
          <label>Nom</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            required
            autoComplete="family-name"
            placeholder="Dupont"
          />
        </div>
      </div>
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
          autoComplete="new-password"
          placeholder="Min. 8 caractères"
          minLength={8}
        />
      </div>
      {error && <div className="auth-error">{error}</div>}
      <button type="submit" className="auth-btn-primary" disabled={loading}>
        {loading ? 'Création…' : 'Créer mon compte'}
      </button>
    </form>
  )
}
