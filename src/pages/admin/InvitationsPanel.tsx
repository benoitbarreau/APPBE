import { useState } from 'react'
import type { InviteMethod } from '../../lib/inviteApi'
import { inviteUser, generatePassword } from '../../lib/inviteApi'

// ── Panneau Invitations ───────────────────────────────────────────────────
export function InvitationsPanel({
  onSuccess,
}: {
  onSuccess?: (email: string, role: 'user' | 'admin') => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [method, setMethod] = useState<InviteMethod>('invite')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    email: string
    role: 'user' | 'admin'
    method: InviteMethod
    password?: string
  } | null>(null)

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      await inviteUser({
        email: email.trim(),
        role,
        fullName: fullName.trim() || undefined,
        method,
        password: method === 'password' ? password : undefined,
      })
      const invited = { email: email.trim(), role, method, password: method === 'password' ? password : undefined }
      setSuccess(invited)
      onSuccess?.(email.trim(), role)
      setEmail('')
      setFullName('')
      setRole('user')
      setMethod('invite')
      setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="invite-success-card">
        <div className="invite-success-icon">✓</div>
        <h3 className="invite-success-title">Compte créé avec succès</h3>
        <div className="invite-success-details">
          <div className="form-row">
            <label>Email</label>
            <span>{success.email}</span>
          </div>
          <div className="form-row">
            <label>Rôle</label>
            <span>{success.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span>
          </div>
          {success.method === 'invite' ? (
            <div className="form-row">
              <label>Invitation</label>
              <span>Email d'invitation envoyé — l'utilisateur devra cliquer sur le lien pour définir son mot de passe.</span>
            </div>
          ) : (
            <div className="form-row invite-success-pwd-row">
              <label>Mot de passe provisoire</label>
              <code className="invite-success-pwd">{success.password}</code>
            </div>
          )}
        </div>
        <button className="primary" onClick={() => setSuccess(null)}>
          + Créer un autre compte
        </button>
      </div>
    )
  }

  const canSubmit = email.trim() !== '' && (method === 'invite' || password.length >= 6)

  return (
    <div className="invite-form">
      <p className="account-hint">
        Créez un compte directement sans passer par le formulaire d'inscription.
        L'utilisateur sera automatiquement approuvé et visible dans l'onglet Utilisateurs.
      </p>

      {/* Email */}
      <div className="invite-field">
        <label className="invite-label">
          Email <span className="invite-required">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="utilisateur@exemple.fr"
          className="invite-input"
        />
      </div>

      {/* Nom complet */}
      <div className="invite-field">
        <label className="invite-label">
          Nom complet <span className="invite-optional">(facultatif)</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Prénom Nom"
          className="invite-input"
        />
      </div>

      {/* Rôle */}
      <div className="invite-field">
        <label className="invite-label">
          Rôle <span className="invite-required">*</span>
        </label>
        <div className="invite-radio-group">
          <label className={`invite-radio-card${role === 'user' ? ' selected' : ''}`}>
            <input type="radio" name="role" value="user" checked={role === 'user'} onChange={() => setRole('user')} />
            <span className="invite-radio-title">Utilisateur</span>
            <span className="invite-radio-desc">Accès standard à ses propres projets</span>
          </label>
          <label className={`invite-radio-card${role === 'admin' ? ' selected' : ''}`}>
            <input type="radio" name="role" value="admin" checked={role === 'admin'} onChange={() => setRole('admin')} />
            <span className="invite-radio-title">Administrateur</span>
            <span className="invite-radio-desc">Accès complet au tableau de bord admin</span>
          </label>
        </div>
      </div>

      {/* Méthode */}
      <div className="invite-field">
        <label className="invite-label">
          Méthode <span className="invite-required">*</span>
        </label>
        <div className="invite-radio-group">
          <label className={`invite-radio-card${method === 'invite' ? ' selected' : ''}`}>
            <input type="radio" name="method" value="invite" checked={method === 'invite'} onChange={() => setMethod('invite')} />
            <span className="invite-radio-title">📧 Email d'invitation</span>
            <span className="invite-radio-desc">L'utilisateur reçoit un lien pour créer son mot de passe</span>
          </label>
          <label className={`invite-radio-card${method === 'password' ? ' selected' : ''}`}>
            <input type="radio" name="method" value="password" checked={method === 'password'} onChange={() => setMethod('password')} />
            <span className="invite-radio-title">🔑 Mot de passe provisoire</span>
            <span className="invite-radio-desc">Accès immédiat — l'utilisateur change son MDP depuis son profil</span>
          </label>
        </div>
      </div>

      {/* Mot de passe provisoire */}
      {method === 'password' && (
        <div className="invite-field">
          <label className="invite-label">
            Mot de passe provisoire <span className="invite-required">*</span>
          </label>
          <div className="invite-pwd-row">
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              className="invite-input invite-pwd-input"
              minLength={6}
              autoComplete="off"
            />
            <button
              type="button"
              className="invite-generate-btn"
              onClick={() => setPassword(generatePassword())}
            >
              Générer
            </button>
          </div>
          <p className="account-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Communiquez ce mot de passe à l'utilisateur par un canal sécurisé.
          </p>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <button
        className="primary"
        style={{ marginTop: 8 }}
        disabled={loading || !canSubmit}
        onClick={() => void handleSubmit()}
      >
        {loading ? 'Création en cours…' : 'Créer le compte'}
      </button>
    </div>
  )
}
