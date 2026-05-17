import { useState } from 'react'
import type { Profile, UserRole, UserStatus } from '../../auth/AuthContext'
import { adminUpdateUser } from '../../lib/adminUserApi'
import { generatePassword } from '../../lib/inviteApi'

interface UserEditModalProps {
  profile: Profile
  isSelf: boolean
  onClose: () => void
  onSaved: (updated: Profile) => void
}

export function UserEditModal({ profile, isSelf, onClose, onSaved }: UserEditModalProps) {
  // ── Champs du compte ─────────────────────────────────────────────
  const [fullName,       setFullName]       = useState(profile.full_name ?? '')
  const [email,          setEmail]          = useState(profile.email)
  const [role,           setRole]           = useState<UserRole>(profile.role)
  const [status,         setStatus]         = useState<UserStatus>(profile.status)
  const [companyName,    setCompanyName]    = useState(profile.company_name ?? '')
  const [companyLogoUrl, setCompanyLogoUrl] = useState(profile.company_logo_url ?? '')

  const [savingInfo,  setSavingInfo]  = useState(false)
  const [infoError,   setInfoError]   = useState<string | null>(null)
  const [infoSuccess, setInfoSuccess] = useState(false)

  // ── Réinitialisation mot de passe ────────────────────────────────
  const [newPassword,  setNewPassword]  = useState('')
  const [showPwdReset, setShowPwdReset] = useState(false)
  const [savingPwd,    setSavingPwd]    = useState(false)
  const [pwdError,     setPwdError]     = useState<string | null>(null)
  const [pwdSuccess,   setPwdSuccess]   = useState(false)

  // ── Sauvegarder les informations ─────────────────────────────────
  const handleSaveInfo = async () => {
    setInfoError(null)
    setInfoSuccess(false)
    setSavingInfo(true)
    try {
      const updates: Parameters<typeof adminUpdateUser>[1] = {}

      const trimmedEmail = email.trim()
      const trimmedName  = fullName.trim()

      const trimmedCompany = companyName.trim()
      const trimmedLogo    = companyLogoUrl.trim()

      if (trimmedEmail && trimmedEmail !== profile.email)           updates.email = trimmedEmail
      if (trimmedName !== (profile.full_name ?? ''))                updates.fullName = trimmedName || null
      if (role   !== profile.role)                                  updates.role = role
      if (status !== profile.status)                                updates.status = status
      if (trimmedCompany !== (profile.company_name ?? ''))          updates.companyName = trimmedCompany || null
      if (trimmedLogo    !== (profile.company_logo_url ?? ''))      updates.companyLogoUrl = trimmedLogo || null

      if (Object.keys(updates).length === 0) {
        setSavingInfo(false)
        return
      }

      await adminUpdateUser(profile.id, updates)

      const updatedProfile: Profile = {
        ...profile,
        full_name:        updates.fullName       !== undefined ? (updates.fullName ?? null)       : profile.full_name,
        email:            updates.email          !== undefined ? updates.email                     : profile.email,
        role:             updates.role           !== undefined ? updates.role                      : profile.role,
        status:           updates.status         !== undefined ? updates.status                    : profile.status,
        company_name:     updates.companyName    !== undefined ? (updates.companyName ?? null)     : profile.company_name,
        company_logo_url: updates.companyLogoUrl !== undefined ? (updates.companyLogoUrl ?? null)  : profile.company_logo_url,
      }
      onSaved(updatedProfile)
      setInfoSuccess(true)
      setTimeout(() => setInfoSuccess(false), 3000)
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSavingInfo(false)
    }
  }

  // ── Réinitialiser le mot de passe ────────────────────────────────
  const handleSavePwd = async () => {
    setPwdError(null)
    setPwdSuccess(false)
    if (newPassword.length < 6) {
      setPwdError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    setSavingPwd(true)
    try {
      await adminUpdateUser(profile.id, { password: newPassword })
      setPwdSuccess(true)
      setNewPassword('')
      setTimeout(() => { setPwdSuccess(false); setShowPwdReset(false) }, 3500)
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="user-edit-modal">
        {/* ── En-tête ─────────────────────────────────────────────── */}
        <div className="user-edit-modal-header">
          <div className="user-edit-modal-title">
            <span className="user-edit-modal-icon">✎</span>
            <div>
              <div className="user-edit-modal-name">{profile.full_name ?? profile.email}</div>
              <div className="user-edit-modal-email">{profile.email}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Fermer">✕</button>
        </div>

        <div className="user-edit-modal-body">

          {/* ── Section : Informations du compte ─────────────────── */}
          <section className="user-edit-section">
            <h3 className="user-edit-section-title">Informations du compte</h3>

            <div className="user-edit-field">
              <label className="user-edit-label">Nom complet</label>
              <input
                type="text"
                className="user-edit-input"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Prénom Nom"
              />
            </div>

            <div className="user-edit-field">
              <label className="user-edit-label">
                Adresse email
                <span className="user-edit-hint"> — une modification peut déclencher une reconfirmation</span>
              </label>
              <input
                type="email"
                className="user-edit-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="user-edit-row-2col">
              <div className="user-edit-field">
                <label className="user-edit-label">Société</label>
                <input
                  type="text"
                  className="user-edit-input"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="Nom de la société"
                />
              </div>

              <div className="user-edit-field">
                <label className="user-edit-label">URL du logo</label>
                <div className="user-edit-logo-row">
                  {companyLogoUrl.trim() && (
                    <img
                      src={companyLogoUrl.trim()}
                      alt="Logo"
                      className="user-edit-logo-preview"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      onLoad={e => { (e.target as HTMLImageElement).style.display = '' }}
                    />
                  )}
                  <input
                    type="url"
                    className="user-edit-input"
                    value={companyLogoUrl}
                    onChange={e => setCompanyLogoUrl(e.target.value)}
                    placeholder="https://…/logo.png"
                  />
                </div>
              </div>
            </div>

            <div className="user-edit-row-2col">
              <div className="user-edit-field">
                <label className="user-edit-label">Rôle</label>
                <select
                  className="user-edit-select"
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  disabled={isSelf}
                  title={isSelf ? 'Impossible de modifier votre propre rôle' : undefined}
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              <div className="user-edit-field">
                <label className="user-edit-label">Statut</label>
                <select
                  className="user-edit-select"
                  value={status}
                  onChange={e => setStatus(e.target.value as UserStatus)}
                >
                  <option value="approved">Approuvé</option>
                  <option value="pending">En attente</option>
                  <option value="rejected">Refusé</option>
                </select>
              </div>
            </div>

            {infoError  && <div className="auth-error" style={{ marginTop: 8 }}>{infoError}</div>}
            {infoSuccess && <div className="user-edit-success">✓ Modifications enregistrées</div>}

            <div className="user-edit-actions">
              <button onClick={onClose}>Annuler</button>
              <button
                className="primary"
                disabled={savingInfo}
                onClick={() => void handleSaveInfo()}
              >
                {savingInfo ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </section>

          {/* ── Section : Mot de passe ───────────────────────────── */}
          <section className="user-edit-section user-edit-section-pwd">
            <h3 className="user-edit-section-title">Mot de passe</h3>

            {!showPwdReset ? (
              <button
                className="user-edit-pwd-toggle"
                onClick={() => setShowPwdReset(true)}
              >
                🔑 Réinitialiser le mot de passe
              </button>
            ) : (
              <>
                <div className="user-edit-field">
                  <label className="user-edit-label">Nouveau mot de passe</label>
                  <div className="invite-pwd-row">
                    <input
                      type="text"
                      className="user-edit-input invite-pwd-input"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      autoComplete="off"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="invite-generate-btn"
                      onClick={() => setNewPassword(generatePassword())}
                    >
                      Générer
                    </button>
                  </div>
                  <p className="account-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                    Communiquez ce mot de passe à l'utilisateur par un canal sécurisé.
                  </p>
                </div>

                {pwdError   && <div className="auth-error" style={{ marginTop: 6 }}>{pwdError}</div>}
                {pwdSuccess && <div className="user-edit-success">✓ Mot de passe réinitialisé avec succès</div>}

                <div className="user-edit-actions">
                  <button onClick={() => { setShowPwdReset(false); setNewPassword(''); setPwdError(null) }}>
                    Annuler
                  </button>
                  <button
                    className="primary"
                    disabled={savingPwd || newPassword.length < 6}
                    onClick={() => void handleSavePwd()}
                  >
                    {savingPwd ? 'Réinitialisation…' : 'Appliquer le nouveau mot de passe'}
                  </button>
                </div>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
