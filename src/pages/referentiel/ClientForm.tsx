import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import {
  updateClient, uploadClientLogo, deleteClientLogo,
  type Client,
} from '../../lib/referentielApi'
import { formatSiret } from './helpers'

// ── Formulaire Client ──────────────────────────────────────────────────────

interface ClientFormProps {
  initial?: Partial<Client>
  clientId?: string
  onSave: (data: Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'account_manager_id' | 'account_manager' | 'deleted_at'>) => Promise<void>
  onLogoUploaded?: (url: string, path: string) => void
  onCancel: () => void
  saving: boolean
}

export function ClientForm({ initial, clientId, onSave, onLogoUploaded, onCancel, saving }: ClientFormProps) {
  const { user } = useAuth()
  const [name, setName]       = useState(initial?.name ?? '')
  const [code, setCode]       = useState(initial?.code ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone]     = useState(initial?.phone ?? '')
  const [email, setEmail]     = useState(initial?.email ?? '')
  const [notes, setNotes]     = useState(initial?.notes ?? '')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(initial?.logo_url ?? null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [dragLogoOver, setDragLogoOver] = useState(false)
  // Mode logo : 'file' = upload fichier, 'url' = lien externe
  const [logoMode, setLogoMode] = useState<'file' | 'url'>(
    initial?.logo_url && !initial?.logo_storage_path ? 'url' : 'file'
  )
  const [logoUrlInput, setLogoUrlInput] = useState(
    initial?.logo_url && !initial?.logo_storage_path ? (initial.logo_url ?? '') : ''
  )
  const nameRef    = useRef<HTMLInputElement>(null)
  const logoRef    = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setLogoFile(f)
    setLogoPreview(URL.createObjectURL(f))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    // En mode URL : on sauvegarde le lien directement, pas d'upload
    const savedLogoUrl = logoMode === 'url' ? (logoUrlInput.trim() || null) : (initial?.logo_url ?? null)
    const savedLogoStoragePath = logoMode === 'url' ? null : (initial?.logo_storage_path ?? null)

    await onSave({
      name: name.trim(),
      code: code.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      logo_url: savedLogoUrl,
      logo_storage_path: savedLogoStoragePath,
    })
    // Upload fichier uniquement en mode 'file'
    if (logoMode === 'file' && logoFile && clientId && user) {
      setUploadingLogo(true)
      try {
        const { publicUrl, storagePath } = await uploadClientLogo(user.id, clientId, logoFile)
        onLogoUploaded?.(publicUrl, storagePath)
      } catch { /* non bloquant */ }
      finally { setUploadingLogo(false) }
    }
  }

  const handleDeleteLogo = async () => {
    if (!clientId) return
    try {
      if (initial?.logo_storage_path) {
        await deleteClientLogo(clientId, initial.logo_storage_path)
      } else {
        await updateClient(clientId, { logo_url: null, logo_storage_path: null })
      }
      setLogoPreview(null)
      setLogoFile(null)
      setLogoUrlInput('')
      onLogoUploaded?.('', '')
    } catch { /* non bloquant */ }
  }

  return (
    <form className="ref-form" onSubmit={e => void handleSubmit(e)}>
      <label>Nom du client *
        <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client" required />
      </label>
      <label>Siret
        <input
          value={code}
          onChange={e => setCode(formatSiret(e.target.value))}
          placeholder="440 870 319 00025"
          maxLength={17}
          inputMode="numeric"
        />
      </label>
      <label>Adresse
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresse" />
      </label>
      <div className="ref-form-row">
        <label>Téléphone
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 …" />
        </label>
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@…" />
        </label>
      </div>
      <label>Notes
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Notes libres…" />
      </label>
      {/* Logo — uniquement à la modification (clientId connu) */}
      {clientId && (
        <div className="ref-logo-upload">
          {/* En-tête : label + bascule mode */}
          <div className="ref-logo-section-header">
            <span className="ref-logo-upload-label">Logo</span>
            <div className="ref-logo-mode-toggle">
              <button type="button"
                className={`ref-logo-mode-btn${logoMode === 'file' ? ' active' : ''}`}
                onClick={() => setLogoMode('file')}>
                📁 Fichier
              </button>
              <button type="button"
                className={`ref-logo-mode-btn${logoMode === 'url' ? ' active' : ''}`}
                onClick={() => setLogoMode('url')}>
                🔗 URL
              </button>
            </div>
          </div>

          {/* Zone glisser-déposer — mode Fichier */}
          {logoMode === 'file' && (
            <div
              className={`ref-logo-drop-zone${dragLogoOver ? ' drag-over' : ''}${logoPreview ? ' has-logo' : ''}`}
              onClick={() => logoRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragLogoOver(true) }}
              onDragLeave={() => setDragLogoOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragLogoOver(false)
                const f = e.dataTransfer.files[0]
                if (f && f.type.startsWith('image/')) {
                  setLogoFile(f)
                  setLogoPreview(URL.createObjectURL(f))
                }
              }}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Logo" className="ref-logo-drop-preview" />
                  <span className="ref-logo-drop-change">Cliquer ou glisser pour changer</span>
                </>
              ) : (
                <>
                  <span className="ref-logo-drop-icon">🖼</span>
                  <span className="ref-logo-drop-label">Glissez votre logo ici ou cliquez pour parcourir</span>
                  <span className="ref-logo-drop-ext">PNG, JPG, SVG, WebP</span>
                </>
              )}
            </div>
          )}

          {/* Saisie URL — mode URL */}
          {logoMode === 'url' && (
            <div className="ref-logo-url-zone">
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="ref-logo-url-preview" />
                : <div className="ref-logo-url-placeholder">🖼</div>
              }
              <div className="ref-logo-url-input-wrap">
                <input
                  type="url"
                  className="ref-logo-url-input"
                  value={logoUrlInput}
                  placeholder="https://exemple.com/logo.png"
                  onChange={e => {
                    setLogoUrlInput(e.target.value)
                    setLogoPreview(e.target.value.trim() || null)
                  }}
                />
                <p className="ref-logo-url-hint">Lien direct vers une image (SharePoint, CDN, site web…)</p>
              </div>
            </div>
          )}

          {/* Supprimer */}
          {logoPreview && (
            <button type="button" className="ref-logo-delete-btn danger"
              onClick={() => void handleDeleteLogo()}>
              🗑 Supprimer le logo
            </button>
          )}

          <input
            ref={logoRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            style={{ display: 'none' }}
            onChange={handleLogoChange}
          />
          {uploadingLogo && <p className="ref-loading-hint">Upload en cours…</p>}
        </div>
      )}
      <div className="ref-form-actions">
        <button type="button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
