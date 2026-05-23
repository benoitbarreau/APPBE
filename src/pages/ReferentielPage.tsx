import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  listClients, createClient, updateClient, deleteClient,
  listSites, createSite, updateSite, deleteSite,
  listRooms, createRoom, updateRoom, deleteRoom,
  listDocuments, createDocument, deleteDocument,
  uploadDocument, getSignedUrl, deleteStorageFile,
  listProjectsByRoom, linkProjectToRoom,
  uploadClientLogo, deleteClientLogo,
  listContacts, createContact, updateContact, deleteContact,
  listRoomContacts, addRoomContact, removeRoomContact,
  type Client, type Site, type Room, type RefDocument, type DocType, type LinkedProject, type Contact, type ContactEntityType,
} from '../lib/referentielApi'
import { listProjects } from '../lib/projectsApi'
import type { ProjectRow } from '../lib/projectsApi'
import { AdminSettings } from '../components/AdminSettings'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

const DOC_ICONS: Record<DocType, string> = {
  pdf: '📄',
  image: '🖼',
  link: '🔗',
  project_export: '📐',
}

const DOC_LABELS: Record<DocType, string> = {
  pdf: 'PDF',
  image: 'Image',
  link: 'Lien externe',
  project_export: 'Export SynoX',
}

const DOC_DESCS: Record<DocType, string> = {
  link: 'SharePoint, OneDrive…',
  pdf: 'Fichier PDF',
  image: 'Photo, plan, schéma',
  project_export: 'Export ou lien SynoX',
}

const ROOM_TYPES = ['Salle de réunion', 'Salle de conférence', 'Auditorium', 'Salle de formation',
  'Studio', 'Régie', 'Salle de contrôle', 'Open-space', 'Couloir', 'Hall', 'Autre']

interface Props {
  onOpenProjects: () => void
  onOpenAdminDashboard?: () => void
  onNewProjectFromRoom?: (roomId: string, roomName: string, siteName: string, clientName: string) => void
  onOpenProject?: (projectId: string, projectName: string) => void
  onGoHome?: () => void
}

// ── Composant modal générique ──────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="ref-modal-overlay" onClick={onClose}>
      <div className="ref-modal" onClick={e => e.stopPropagation()}>
        <div className="ref-modal-header">
          <h3 className="ref-modal-title">{title}</h3>
          <button className="ref-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ref-modal-body">{children}</div>
      </div>
    </div>
  )
}

// ── Utilitaire SIRET ───────────────────────────────────────────────────────

/** Formate une valeur saisie en SIRET : "XXX XXX XXX XXXXX" (3+3+3+5 chiffres) */
function formatSiret(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
}

// ── Formulaire Client ──────────────────────────────────────────────────────

interface ClientFormProps {
  initial?: Partial<Client>
  clientId?: string
  onSave: (data: Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onLogoUploaded?: (url: string, path: string) => void
  onCancel: () => void
  saving: boolean
}

function ClientForm({ initial, clientId, onSave, onLogoUploaded, onCancel, saving }: ClientFormProps) {
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

// ── Formulaire Site ────────────────────────────────────────────────────────

interface SiteFormProps {
  initial?: Partial<Site>
  onSave: (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function SiteForm({ initial, onSave, onCancel, saving }: SiteFormProps) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes]     = useState(initial?.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSave({ name: name.trim(), address: address.trim() || null, notes: notes.trim() || null })
  }

  return (
    <form className="ref-form" onSubmit={e => void handleSubmit(e)}>
      <label>Nom du site *
        <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="Nom du site" required />
      </label>
      <label>Adresse
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Adresse du site" />
      </label>
      <label>Notes
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes…" />
      </label>
      <div className="ref-form-actions">
        <button type="button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ── Formulaire Salle ───────────────────────────────────────────────────────

interface RoomFormProps {
  initial?: Partial<Room>
  onSave: (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function RoomForm({ initial, onSave, onCancel, saving }: RoomFormProps) {
  const [name, setName]   = useState(initial?.name ?? '')
  const [type, setType]   = useState(initial?.type ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSave({ name: name.trim(), type: type || null, notes: notes.trim() || null })
  }

  return (
    <form className="ref-form" onSubmit={e => void handleSubmit(e)}>
      <label>Nom de la salle *
        <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="Salle principale…" required />
      </label>
      <label>Type de salle
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="">— Choisir un type —</option>
          {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Notes
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes…" />
      </label>
      <div className="ref-form-actions">
        <button type="button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="primary" disabled={saving || !name.trim()}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ── Formulaire Contact ─────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: Partial<Contact>
  onSave: (data: Omit<Contact, 'id' | 'entity_type' | 'entity_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ContactForm({ initial, onSave, onCancel, saving }: ContactFormProps) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '')
  const [lastName,  setLastName]  = useState(initial?.last_name  ?? '')
  const [role,      setRole]      = useState(initial?.role       ?? '')
  const [phone,     setPhone]     = useState(initial?.phone      ?? '')
  const [email,     setEmail]     = useState(initial?.email      ?? '')
  const [notes,     setNotes]     = useState(initial?.notes      ?? '')
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    await onSave({
      first_name: firstName.trim(),
      last_name:  lastName.trim(),
      role:  role.trim()  || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form className="ref-form" onSubmit={e => void handleSubmit(e)}>
      <div className="ref-form-row">
        <label>Prénom *
          <input ref={firstRef} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Prénom" required />
        </label>
        <label>Nom *
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nom" required />
        </label>
      </div>
      <label>Fonction / Poste
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="Ex : Directeur technique, Chef de projet…" />
      </label>
      <div className="ref-form-row">
        <label>Téléphone
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 6 …" />
        </label>
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="prenom@…" />
        </label>
      </div>
      <label>Notes
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes…" />
      </label>
      <div className="ref-form-actions">
        <button type="button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="primary" disabled={saving || !firstName.trim() || !lastName.trim()}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ── Section Contacts (réutilisable pour site et salle) ─────────────────────

interface ContactsSectionProps {
  entityType: ContactEntityType
  entityId: string
  /** Si true, les contacts sont masqués par défaut et chargés à la première ouverture */
  defaultCollapsed?: boolean
}

function ContactsSection({ entityType, entityId, defaultCollapsed = false }: ContactsSectionProps) {
  const [contacts,   setContacts]  = useState<Contact[]>([])
  const [loading,    setLoading]   = useState(false)
  const [collapsed,  setCollapsed] = useState(defaultCollapsed)
  const [addOpen,    setAddOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState<Contact | null>(null)
  const [saving,     setSaving]    = useState(false)
  const [error,      setError]     = useState<string | null>(null)
  const loadedRef = useRef(false)

  /** Charge les contacts une seule fois (mémorisé via loadedRef). */
  const loadNow = useCallback(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    listContacts(entityType, entityId)
      .then(setContacts)
      .catch(() => setError('Erreur chargement contacts'))
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  // Charger immédiatement si la section est ouverte par défaut
  useEffect(() => {
    if (!defaultCollapsed) loadNow()
  }, [defaultCollapsed, loadNow])

  const toggle = () => {
    if (collapsed) {
      setCollapsed(false)
      loadNow()
    } else {
      setCollapsed(true)
      setAddOpen(false)
    }
  }

  const handleCreate = async (data: Omit<Contact, 'id' | 'entity_type' | 'entity_id' | 'created_at' | 'updated_at'>) => {
    setSaving(true)
    try {
      const c = await createContact({ ...data, entity_type: entityType, entity_id: entityId })
      setContacts(prev => [...prev, c].sort((a, b) => a.last_name.localeCompare(b.last_name)))
      setAddOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const handleUpdate = async (data: Omit<Contact, 'id' | 'entity_type' | 'entity_id' | 'created_at' | 'updated_at'>) => {
    if (!editTarget) return
    setSaving(true)
    try {
      await updateContact(editTarget.id, data)
      setContacts(prev =>
        prev.map(c => c.id === editTarget.id ? { ...editTarget, ...data } : c)
            .sort((a, b) => a.last_name.localeCompare(b.last_name))
      )
      setEditTarget(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const handleDelete = async (c: Contact) => {
    if (!confirm(`Supprimer le contact ${c.first_name} ${c.last_name} ?`)) return
    try {
      await deleteContact(c.id)
      setContacts(prev => prev.filter(x => x.id !== c.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur suppression') }
  }

  return (
    <div className="ref-contacts-section">
      {/* En-tête cliquable (toggle) */}
      <div className="ref-contacts-header">
        <button className="ref-contacts-toggle-btn" type="button" onClick={toggle}>
          <h4 className="ref-section-title" style={{ marginBottom: 0 }}>
            Contacts
            {contacts.length > 0 && (
              <span className="ref-count-badge">{contacts.length}</span>
            )}
          </h4>
          <span className={`ref-toggle-arrow${collapsed ? '' : ' open'}`}>▼</span>
        </button>
        {!collapsed && (
          <button className="ref-add-btn" type="button"
            onClick={() => { setAddOpen(v => !v); setEditTarget(null) }}>
            {addOpen ? 'Annuler' : '+ Ajouter'}
          </button>
        )}
      </div>

      {/* Contenu (masqué quand collapsed) */}
      {!collapsed && (
        <div className="ref-contacts-body">
          {error && <p className="ref-error" style={{ marginBottom: 8 }}>{error}</p>}

          {addOpen && (
            <div className="ref-contact-form-wrap">
              <ContactForm onSave={handleCreate} onCancel={() => setAddOpen(false)} saving={saving} />
            </div>
          )}

          {editTarget && (
            <Modal
              title={`Modifier — ${editTarget.first_name} ${editTarget.last_name}`}
              onClose={() => setEditTarget(null)}
            >
              <ContactForm
                initial={editTarget}
                onSave={handleUpdate}
                onCancel={() => setEditTarget(null)}
                saving={saving}
              />
            </Modal>
          )}

          {loading ? (
            <p className="ref-loading-hint">Chargement…</p>
          ) : contacts.length === 0 && !addOpen ? (
            <p className="ref-empty-hint">Aucun contact. Cliquez sur + Ajouter pour en créer un.</p>
          ) : (
            <ul className="ref-contact-list">
              {contacts.map(c => (
                <li key={c.id} className="ref-contact-item">
                  <div className="ref-contact-avatar">
                    {c.first_name[0]}{c.last_name[0]}
                  </div>
                  <div className="ref-contact-info">
                    <span className="ref-contact-name">{c.first_name} {c.last_name}</span>
                    {c.role  && <span className="ref-contact-role">{c.role}</span>}
                    <div className="ref-contact-coords">
                      {c.phone && <a href={`tel:${c.phone}`} className="ref-contact-link">📞 {c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="ref-contact-link">✉ {c.email}</a>}
                    </div>
                    {c.notes && <p className="ref-contact-notes">{c.notes}</p>}
                  </div>
                  <div className="ref-contact-actions">
                    <button type="button" onClick={() => setEditTarget(c)} title="Modifier">✏</button>
                    <button type="button" className="danger" onClick={() => void handleDelete(c)} title="Supprimer">🗑</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Contacts assignés à une salle (sélection depuis les contacts client) ──

interface RoomContactsSectionProps {
  room: Room
  clientId: string
}

function RoomContactsSection({ room, clientId }: RoomContactsSectionProps) {
  const [assigned, setAssigned] = useState<Contact[]>([])
  const [clientContacts, setClientContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listRoomContacts(room.id)
      .then(setAssigned)
      .catch(() => setError('Erreur chargement contacts'))
      .finally(() => setLoading(false))
  }, [room.id])

  const openPicker = async () => {
    setPickerOpen(true)
    setPickerLoading(true)
    try {
      const contacts = await listContacts('client', clientId)
      setClientContacts(contacts)
    } catch { setError('Impossible de charger la liste des contacts') }
    finally { setPickerLoading(false) }
  }

  const handleAssign = async (c: Contact) => {
    setAssigning(true)
    try {
      await addRoomContact(room.id, c.id)
      setAssigned(prev => [...prev, c].sort((a, b) => a.last_name.localeCompare(b.last_name)))
      setPickerOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setAssigning(false) }
  }

  const handleRemove = async (c: Contact) => {
    if (!confirm(`Retirer ${c.first_name} ${c.last_name} de cette salle ?`)) return
    try {
      await removeRoomContact(room.id, c.id)
      setAssigned(prev => prev.filter(x => x.id !== c.id))
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
  }

  const available = clientContacts.filter(c => !assigned.some(a => a.id === c.id))

  return (
    <div className="ref-room-panel-section">
      <div className="ref-section-header">
        <h4 className="ref-section-title">
          Contacts assignés
          {assigned.length > 0 && <span className="ref-count-badge">{assigned.length}</span>}
        </h4>
        <button className="ref-add-btn" onClick={openPicker}>+ Assigner</button>
      </div>

      {error && <p className="ref-error" style={{ marginBottom: 8 }}>{error}</p>}

      {loading ? (
        <p className="ref-loading-hint">Chargement…</p>
      ) : assigned.length === 0 ? (
        <p className="ref-empty-hint">Aucun contact assigné. Cliquez sur + Assigner pour en ajouter depuis la liste client.</p>
      ) : (
        <ul className="ref-contact-list">
          {assigned.map(c => (
            <li key={c.id} className="ref-contact-item">
              <div className="ref-contact-avatar">{c.first_name[0]}{c.last_name[0]}</div>
              <div className="ref-contact-info">
                <span className="ref-contact-name">{c.first_name} {c.last_name}</span>
                {c.role && <span className="ref-contact-role">{c.role}</span>}
                <div className="ref-contact-coords">
                  {c.phone && <a href={`tel:${c.phone}`} className="ref-contact-link">📞 {c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="ref-contact-link">✉ {c.email}</a>}
                </div>
              </div>
              <div className="ref-contact-actions">
                <button type="button" className="danger" onClick={() => void handleRemove(c)} title="Retirer de la salle">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Picker modal */}
      {pickerOpen && (
        <Modal title="Assigner un contact à cette salle" onClose={() => setPickerOpen(false)}>
          {pickerLoading ? (
            <p className="ref-loading-hint">Chargement…</p>
          ) : available.length === 0 ? (
            <p className="ref-empty-hint">
              {clientContacts.length === 0
                ? 'Aucun contact sur ce client. Créez d\'abord des contacts dans la fiche client.'
                : 'Tous les contacts du client sont déjà assignés à cette salle.'}
            </p>
          ) : (
            <ul className="ref-link-project-list">
              {available.map(c => (
                <li key={c.id} className="ref-link-project-item">
                  <div className="ref-contact-avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0 }}>
                    {c.first_name[0]}{c.last_name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.first_name} {c.last_name}</div>
                    {c.role && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.role}</div>}
                    {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>📞 {c.phone}</div>}
                  </div>
                  <button
                    className="primary"
                    disabled={assigning}
                    onClick={() => void handleAssign(c)}
                  >
                    {assigning ? '…' : 'Assigner'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── Panneau de détail d'une salle ─────────────────────────────────────────

interface RoomPanelProps {
  room: Room
  site: Site
  client: Client
  onClose: () => void
  onRoomUpdated: (updated: Room) => void
  onRoomDeleted: () => void
  onNewProject?: (roomId: string, roomName: string, siteName: string, clientName: string) => void
  onOpenProject?: (projectId: string, projectName: string) => void
}

function RoomPanel({ room, site, client, onClose, onRoomUpdated, onRoomDeleted, onNewProject, onOpenProject }: RoomPanelProps) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [savingRoom, setSavingRoom] = useState(false)
  const [docs, setDocs] = useState<RefDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([])
  // Liaison projet existant
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [allProjects, setAllProjects] = useState<ProjectRow[]>([])
  const [projSearch, setProjSearch] = useState('')
  const [linking, setLinking] = useState(false)
  // Nouveau projet
  const [newProjDialogOpen, setNewProjDialogOpen] = useState(false)
  const [newProjName, setNewProjName] = useState('')
  const [projLoading, setProjLoading] = useState(true)
  const [docType, setDocType] = useState<DocType>('link')
  const [docName, setDocName] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [docFiles, setDocFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDocsLoading(true)
    listDocuments('room', room.id)
      .then(setDocs)
      .catch(() => setError('Erreur chargement documents'))
      .finally(() => setDocsLoading(false))

    setProjLoading(true)
    listProjectsByRoom(room.id)
      .then(setLinkedProjects)
      .catch(() => {})
      .finally(() => setProjLoading(false))
  }, [room.id])

  const handleSaveRoom = async (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => {
    setSavingRoom(true)
    try {
      await updateRoom(room.id, data)
      onRoomUpdated({ ...room, ...data })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSavingRoom(false)
    }
  }

  const handleDeleteRoom = async () => {
    if (!confirm(`Supprimer la salle « ${room.name} » et tous ses documents ?`)) return
    try {
      await deleteRoom(room.id)
      onRoomDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression')
    }
  }

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUploadProgress(true)
    try {
      // ── Cas : plusieurs fichiers uploadés d'un coup (images ou PDFs) ────
      if (docFiles.length > 1 && (docType === 'image' || docType === 'pdf') && user) {
        const newDocs: RefDocument[] = []
        for (const f of docFiles) {
          const result = await uploadDocument(user.id, 'room', room.id, f)
          const baseName = f.name.replace(/\.[^/.]+$/, '')
          const doc = await createDocument({
            entity_type: 'room',
            entity_id: room.id,
            name: baseName,
            doc_type: docType,
            url: result.publicUrl,
            storage_path: result.storagePath,
            file_size: f.size,
          })
          newDocs.push(doc)
        }
        setDocs(prev => [...newDocs.reverse(), ...prev])
        setDocFiles([])
        setDocName('')
        return
      }

      // ── Cas : fichier unique ou lien ───────────────────────────────────
      let url: string | null = docUrl.trim() || null
      let storagePath: string | null = null
      let fileSize: number | null = null
      const singleFile = docFiles[0] ?? null

      if ((docType === 'pdf' || docType === 'image') && singleFile && user) {
        const result = await uploadDocument(user.id, 'room', room.id, singleFile)
        storagePath = result.storagePath
        fileSize = singleFile.size
        url = result.publicUrl
      }

      // Nom auto-rempli depuis le fichier si le champ est vide
      const finalName = docName.trim() || (singleFile ? singleFile.name.replace(/\.[^/.]+$/, '') : '')
      if (!finalName) { setError('Veuillez saisir un nom de document'); return }

      const doc = await createDocument({
        entity_type: 'room',
        entity_id: room.id,
        name: finalName,
        doc_type: docType,
        url,
        storage_path: storagePath,
        file_size: fileSize,
      })
      setDocs(prev => [doc, ...prev])
      setDocName('')
      setDocUrl('')
      setDocFiles([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur ajout document')
    } finally {
      setUploadProgress(false)
    }
  }

  const handleDeleteDoc = async (doc: RefDocument) => {
    if (!confirm(`Supprimer « ${doc.name} » ?`)) return
    try {
      if (doc.storage_path) await deleteStorageFile(doc.storage_path).catch(() => {})
      await deleteDocument(doc.id)
      setDocs(prev => prev.filter(d => d.id !== doc.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression')
    }
  }

  const handleOpenDoc = async (doc: RefDocument) => {
    try {
      let target: string | null = null
      if (doc.storage_path) {
        // Fichier dans le bucket privé → URL signée (valable 1 heure)
        target = await getSignedUrl(doc.storage_path)
      } else {
        // Lien externe (SharePoint, OneDrive, etc.)
        target = doc.url ?? null
      }
      if (target) window.open(target, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d\'ouvrir le fichier')
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  return (
    <div className="ref-room-panel-overlay" onClick={onClose}>
      <div className="ref-room-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ref-room-panel-header">
          <div className="ref-room-panel-breadcrumb">
            <span className="ref-breadcrumb-muted">{client.name}</span>
            <span className="ref-breadcrumb-sep">›</span>
            <span className="ref-breadcrumb-muted">{site.name}</span>
            <span className="ref-breadcrumb-sep">›</span>
            <strong>{room.name}</strong>
          </div>
          <div className="ref-room-panel-actions">
            <button onClick={() => setEditing(v => !v)} title="Modifier la salle">
              {editing ? 'Annuler' : 'Modifier'}
            </button>
            <button className="danger" onClick={() => void handleDeleteRoom()} title="Supprimer">
              🗑
            </button>
            <button className="ref-panel-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="ref-room-panel-body">
          {error && <div className="ref-error">{error}</div>}

          {/* Infos salle */}
          {editing ? (
            <div className="ref-room-panel-section">
              <RoomForm
                initial={room}
                onSave={handleSaveRoom}
                onCancel={() => setEditing(false)}
                saving={savingRoom}
              />
            </div>
          ) : (
            <div className="ref-room-panel-section">
              <div className="ref-room-info-grid">
                {room.type && (
                  <div className="ref-room-info-item">
                    <span className="ref-room-info-label">Type</span>
                    <span className="ref-room-type-badge">{room.type}</span>
                  </div>
                )}
                {room.notes && (
                  <div className="ref-room-info-item ref-room-info-notes">
                    <span className="ref-room-info-label">Notes</span>
                    <span className="ref-room-info-value">{room.notes}</span>
                  </div>
                )}
                {!room.type && !room.notes && (
                  <p className="ref-empty-hint">Aucune information. Cliquez sur Modifier pour en ajouter.</p>
                )}
              </div>
            </div>
          )}

          {/* Contacts assignés (depuis la liste du client) */}
          <RoomContactsSection room={room} clientId={client.id} />

          {/* Projets SynoX liés */}
          <div className="ref-room-panel-section">
            <div className="ref-section-header">
              <h4 className="ref-section-title">Projets SynoX</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="ref-add-btn"
                  onClick={() => {
                    setLinkModalOpen(true)
                    setProjSearch('')
                    listProjects(false).then(setAllProjects).catch(() => {})
                  }}
                  title="Lier un projet existant"
                >
                  + Lier
                </button>
                {onNewProject && (
                  <button
                    className="ref-add-btn"
                    style={{ background: '#eef8f0', borderColor: '#a8d5b5', color: '#1a7a3c' }}
                    onClick={() => { setNewProjDialogOpen(true); setNewProjName(room.name) }}
                    title="Créer un nouveau projet SynoX pour cette salle"
                  >
                    + Nouveau projet
                  </button>
                )}
              </div>
            </div>

            {projLoading ? (
              <p className="ref-loading-hint">Chargement…</p>
            ) : linkedProjects.length === 0 ? (
              <p className="ref-empty-hint">Aucun projet associé. Cliquez sur + Lier ou + Nouveau projet.</p>
            ) : (
              <ul className="ref-linked-projects">
                {linkedProjects.map(p => (
                  <li key={p.id} className="ref-linked-project-item">
                    <span className="ref-linked-project-icon">📐</span>
                    {onOpenProject ? (
                      <button
                        className="ref-linked-project-name ref-linked-project-name--link"
                        title="Cliquer pour ouvrir dans l'éditeur"
                        onClick={() => onOpenProject(p.id, p.name)}
                      >
                        {p.name}
                      </button>
                    ) : (
                      <span className="ref-linked-project-name">{p.name}</span>
                    )}
                    <span className="ref-linked-project-date">{fmt(p.updated_at)}</span>
                    <button
                      className="danger"
                      style={{ padding: '2px 6px', fontSize: 11 }}
                      title="Détacher ce projet de la salle"
                      onClick={async () => {
                        if (!confirm(`Détacher le projet « ${p.name} » de cette salle ?`)) return
                        await linkProjectToRoom(p.id, null)
                        setLinkedProjects(prev => prev.filter(x => x.id !== p.id))
                      }}
                    >
                      Détacher
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Modal : lier un projet existant */}
            {linkModalOpen && (
              <div className="ref-modal-overlay" onClick={() => setLinkModalOpen(false)}>
                <div className="ref-modal" onClick={e => e.stopPropagation()}>
                  <div className="ref-modal-header">
                    <h3 className="ref-modal-title">Lier un projet existant</h3>
                    <button className="ref-modal-close" onClick={() => setLinkModalOpen(false)}>×</button>
                  </div>
                  <div className="ref-modal-body">
                    <input
                      className="projects-search-input"
                      style={{ marginBottom: 12 }}
                      placeholder="Rechercher un projet…"
                      value={projSearch}
                      onChange={e => setProjSearch(e.target.value)}
                      autoFocus
                    />
                    <ul className="ref-link-project-list">
                      {allProjects
                        .filter(p => !projSearch || p.name.toLowerCase().includes(projSearch.toLowerCase()))
                        .filter(p => !linkedProjects.some(lp => lp.id === p.id))
                        .map(p => (
                          <li key={p.id} className="ref-link-project-item">
                            <span className="ref-link-project-name">{p.name}</span>
                            {p.client_name && <span className="ref-link-project-meta">{p.client_name}</span>}
                            <button
                              className="primary"
                              disabled={linking}
                              onClick={async () => {
                                setLinking(true)
                                try {
                                  await linkProjectToRoom(p.id, room.id)
                                  setLinkedProjects(prev => [...prev, { id: p.id, name: p.name, updated_at: p.updated_at }])
                                  setLinkModalOpen(false)
                                } catch { /* ignore */ }
                                finally { setLinking(false) }
                              }}
                            >
                              {linking ? '…' : 'Lier'}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Dialog : nouveau projet */}
            {newProjDialogOpen && (
              <div className="ref-modal-overlay" onClick={() => setNewProjDialogOpen(false)}>
                <div className="ref-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                  <div className="ref-modal-header">
                    <h3 className="ref-modal-title">Nouveau projet SynoX</h3>
                    <button className="ref-modal-close" onClick={() => setNewProjDialogOpen(false)}>×</button>
                  </div>
                  <div className="ref-modal-body">
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
                      Le projet sera automatiquement lié à la salle <strong>{room.name}</strong>.
                    </p>
                    <label className="ref-form" style={{ gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Nom du projet *</span>
                      <input
                        className="projects-search-input"
                        value={newProjName}
                        onChange={e => setNewProjName(e.target.value)}
                        placeholder="Nom du projet…"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newProjName.trim()) onNewProject?.(room.id, newProjName.trim(), site.name, client.name)
                          if (e.key === 'Escape') setNewProjDialogOpen(false)
                        }}
                      />
                    </label>
                    <div className="ref-form-actions" style={{ marginTop: 16 }}>
                      <button onClick={() => setNewProjDialogOpen(false)}>Annuler</button>
                      <button
                        className="primary"
                        disabled={!newProjName.trim()}
                        onClick={() => onNewProject?.(room.id, newProjName.trim(), site.name, client.name)}
                      >
                        Créer et ouvrir l'éditeur →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="ref-room-panel-section">
            <h4 className="ref-section-title">Documents</h4>

            {/* Formulaire toujours visible */}
            <form className="ref-add-doc-form ref-form" onSubmit={e => void handleAddDoc(e)}>
              <div className="ref-doc-type-grid">
                {(['link', 'pdf', 'image', 'project_export'] as DocType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`ref-doc-type-btn${docType === t ? ' active' : ''}`}
                    onClick={() => { setDocType(t as DocType); setDocFiles([]); setDocUrl('') }}
                  >
                    <span className="ref-doc-type-btn-icon">{DOC_ICONS[t]}</span>
                    <span className="ref-doc-type-btn-label">{DOC_LABELS[t]}</span>
                    <span className="ref-doc-type-btn-desc">{DOC_DESCS[t]}</span>
                  </button>
                ))}
              </div>

              <label>Nom du document
                <input
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  placeholder={
                    docFiles.length > 1
                      ? 'Nom auto-rempli depuis chaque fichier'
                      : docFiles.length === 1
                        ? docFiles[0].name.replace(/\.[^/.]+$/, '')
                        : 'Ex : Plan de salle, Rapport technique…'
                  }
                  disabled={docFiles.length > 1}
                />
              </label>

              {docType === 'link' || docType === 'project_export' ? (
                <label>URL
                  <input
                    type="url"
                    value={docUrl}
                    onChange={e => setDocUrl(e.target.value)}
                    placeholder="https://sharepoint.com/…"
                  />
                </label>
              ) : (
                <div
                  className={`ref-file-drop-zone${dragOver ? ' drag-over' : ''}${docFiles.length > 0 ? ' has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragOver(false)
                    const files = Array.from(e.dataTransfer.files)
                    const filtered = docType === 'pdf'
                      ? files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
                      : files.filter(f => f.type.startsWith('image/'))
                    if (filtered.length > 0) {
                      setDocFiles(filtered)
                      if (filtered.length === 1 && !docName.trim()) {
                        setDocName(filtered[0].name.replace(/\.[^/.]+$/, ''))
                      }
                    }
                  }}
                >
                  {docFiles.length > 0 ? (
                    <>
                      <span className="ref-file-drop-icon">{docFiles.length > 1 ? '📂' : '✅'}</span>
                      <span className="ref-file-drop-name">
                        {docFiles.length === 1 ? docFiles[0].name : `${docFiles.length} fichiers sélectionnés`}
                      </span>
                      <span className="ref-file-drop-size">
                        {fmtSize(docFiles.reduce((s, f) => s + f.size, 0))}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="ref-file-drop-icon">📁</span>
                      <span className="ref-file-drop-label">
                        {docType === 'image'
                          ? 'Glissez une ou plusieurs images, ou cliquez pour parcourir'
                          : 'Glissez un ou plusieurs PDF, ou cliquez pour parcourir'}
                      </span>
                      <span className="ref-file-drop-ext">
                        {docType === 'pdf' ? 'Fichiers .pdf uniquement' : 'Images JPG, PNG, GIF, WebP…'}
                      </span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={docType === 'pdf' ? '.pdf,application/pdf' : 'image/*'}
                    multiple={docType === 'image' || docType === 'pdf'}
                    style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files ?? [])
                      if (files.length > 0) {
                        setDocFiles(files)
                        if (files.length === 1 && !docName.trim()) {
                          setDocName(files[0].name.replace(/\.[^/.]+$/, ''))
                        }
                      }
                    }}
                  />
                </div>
              )}

              <div className="ref-form-actions">
                <button
                  type="button"
                  onClick={() => { setDocFiles([]); setDocName(''); setDocUrl('') }}
                  disabled={docFiles.length === 0 && !docName.trim() && !docUrl.trim()}
                >
                  Effacer
                </button>
                <button type="submit" className="primary" disabled={uploadProgress}>
                  {uploadProgress ? 'Upload en cours…' : 'Ajouter'}
                </button>
              </div>
            </form>

            {/* Liste des documents */}
            {docsLoading ? (
              <p className="ref-loading-hint" style={{ marginTop: 12 }}>Chargement…</p>
            ) : docs.length === 0 ? (
              <p className="ref-empty-hint" style={{ marginTop: 12 }}>Aucun document pour l'instant.</p>
            ) : (
              <ul className="ref-doc-list" style={{ marginTop: 12 }}>
                {docs.map(doc => (
                  <li key={doc.id} className="ref-doc-item">
                    <span className="ref-doc-icon">{DOC_ICONS[doc.doc_type]}</span>
                    <div className="ref-doc-info">
                      <button
                        className="ref-doc-name"
                        onClick={() => void handleOpenDoc(doc)}
                        title="Ouvrir"
                      >
                        {doc.name}
                      </button>
                      <div className="ref-doc-meta">
                        <span className="ref-doc-type">{DOC_LABELS[doc.doc_type]}</span>
                        {doc.file_size && <span>· {fmtSize(doc.file_size)}</span>}
                        <span>· {fmt(doc.created_at)}</span>
                      </div>
                    </div>
                    <button
                      className="ref-doc-delete danger"
                      onClick={() => void handleDeleteDoc(doc)}
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────

export function ReferentielPage({ onOpenProjects, onOpenAdminDashboard, onNewProjectFromRoom, onOpenProject, onGoHome }: Props) {
  const { profile, signOut } = useAuth()

  // ── Navigation interne ──
  const [view, setView] = useState<'clients' | 'client'>('clients')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedRoomSite, setSelectedRoomSite] = useState<Site | null>(null)

  // ── Données ──
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [sitesMap, setSitesMap] = useState<Record<string, Site[]>>({})
  const [roomsMap, setRoomsMap] = useState<Record<string, Room[]>>({})
  const [sitesLoading, setSitesLoading] = useState(false)

  // ── UI / erreur ──
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  // ── Modaux ──
  const [clientModal, setClientModal] = useState<'create' | Client | null>(null)
  const [siteModal, setSiteModal] = useState<'create' | Site | null>(null)
  const [roomModal, setRoomModal] = useState<{ mode: 'create'; siteId: string } | { mode: 'edit'; room: Room } | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Chargement clients ──
  const loadClients = () => {
    setClientsLoading(true)
    listClients()
      .then(setClients)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement clients'))
      .finally(() => setClientsLoading(false))
  }

  useEffect(() => { loadClients() }, [])

  // ── Drill-down vers un client ──
  const openClient = async (client: Client) => {
    setSelectedClient(client)
    setView('client')
    if (!sitesMap[client.id]) {
      setSitesLoading(true)
      try {
        const sites = await listSites(client.id)
        setSitesMap(prev => ({ ...prev, [client.id]: sites }))
        const roomPromises = sites.map(s => listRooms(s.id).then(rooms => ({ siteId: s.id, rooms })))
        const results = await Promise.all(roomPromises)
        const newRoomsMap: Record<string, Room[]> = {}
        for (const r of results) newRoomsMap[r.siteId] = r.rooms
        setRoomsMap(prev => ({ ...prev, ...newRoomsMap }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur chargement sites')
      } finally {
        setSitesLoading(false)
      }
    }
  }

  const backToClients = () => {
    setView('clients')
    setSelectedClient(null)
  }

  // ── CRUD Clients ──
  const handleCreateClient = async (data: Parameters<typeof createClient>[0]) => {
    setSaving(true)
    try {
      const c = await createClient(data)
      setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
      setClientModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création client')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateClient = async (data: Parameters<typeof createClient>[0]) => {
    if (!clientModal || clientModal === 'create') return
    setSaving(true)
    try {
      await updateClient(clientModal.id, data)
      const updated = { ...clientModal, ...data }
      setClients(prev => prev.map(c => c.id === updated.id ? updated as Client : c).sort((a, b) => a.name.localeCompare(b.name)))
      if (selectedClient?.id === updated.id) setSelectedClient(updated as Client)
      setClientModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification client')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClient = async (client: Client) => {
    if (!confirm(`Supprimer le client « ${client.name} » et tous ses sites, salles et documents ?`)) return
    try {
      await deleteClient(client.id)
      setClients(prev => prev.filter(c => c.id !== client.id))
      if (view === 'client' && selectedClient?.id === client.id) backToClients()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression client')
    }
  }

  // ── CRUD Sites ──
  const handleCreateSite = async (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => {
    if (!selectedClient) return
    setSaving(true)
    try {
      const s = await createSite({ ...data, client_id: selectedClient.id })
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: [...(prev[selectedClient.id] ?? []), s].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomsMap(prev => ({ ...prev, [s.id]: [] }))
      setSiteModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création site')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSite = async (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => {
    if (!siteModal || siteModal === 'create' || !selectedClient) return
    setSaving(true)
    try {
      await updateSite(siteModal.id, data)
      const updated = { ...siteModal, ...data }
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: (prev[selectedClient.id] ?? [])
          .map(s => s.id === updated.id ? updated as Site : s)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setSiteModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification site')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSite = async (site: Site) => {
    if (!selectedClient) return
    if (!confirm(`Supprimer le site « ${site.name} » et toutes ses salles ?`)) return
    try {
      await deleteSite(site.id)
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: (prev[selectedClient.id] ?? []).filter(s => s.id !== site.id),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression site')
    }
  }

  // ── CRUD Rooms ──
  const handleCreateRoom = async (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => {
    if (!roomModal || roomModal.mode !== 'create') return
    setSaving(true)
    try {
      const r = await createRoom({ ...data, site_id: roomModal.siteId })
      setRoomsMap(prev => ({
        ...prev,
        [roomModal.siteId]: [...(prev[roomModal.siteId] ?? []), r].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création salle')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateRoom = async (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => {
    if (!roomModal || roomModal.mode !== 'edit') return
    setSaving(true)
    try {
      await updateRoom(roomModal.room.id, data)
      const updated = { ...roomModal.room, ...data }
      setRoomsMap(prev => ({
        ...prev,
        [roomModal.room.site_id]: (prev[roomModal.room.site_id] ?? [])
          .map(r => r.id === updated.id ? updated as Room : r)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification salle')
    } finally {
      setSaving(false)
    }
  }

  // ── Filtrage ──
  const filteredClients = clients.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)
  })

  const sites = selectedClient ? (sitesMap[selectedClient.id] ?? []) : []

  // ── Rendu ──
  return (
    <div className="projects-page">
      {/* ── Header ── */}
      <header className="projects-page-header">
        <div className="projects-page-brand">
          <img src={logoUrl} alt="SynoX" className="projects-page-logo" />
          <span className="projects-page-title">SynoX</span>
        </div>

        {/* Navigation principale */}
        <nav className="ref-main-nav">
          {onGoHome && (
            <button className="ref-nav-btn" onClick={onGoHome}>
              ← Accueil
            </button>
          )}
          <button className="ref-nav-btn" onClick={onOpenProjects}>
            Projets en cours
          </button>
          <button className="ref-nav-btn ref-nav-btn-active">
            Référentiel
          </button>
        </nav>

        <div className="projects-page-user">
          <button onClick={() => void signOut()} className="btn-signout" title="Se déconnecter">
            Se déconnecter
          </button>
          {profile?.role === 'admin' && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <button className="btn-account" onClick={() => setAccountOpen(true)} title="Gérer mon compte">
            <span className="btn-account-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="btn-account-name">
              {profile?.full_name ?? profile?.email ?? ''}
            </span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="projects-page-main">
        <div className="projects-page-container" style={{ maxWidth: 1100 }}>

          {/* Breadcrumb */}
          <nav className="ref-breadcrumb">
            <button
              className={`ref-breadcrumb-item${view === 'clients' ? ' active' : ''}`}
              onClick={backToClients}
            >
              Clients
            </button>
            {view === 'client' && selectedClient && (
              <>
                <span className="ref-breadcrumb-sep">›</span>
                <span className="ref-breadcrumb-item active">{selectedClient.name}</span>
              </>
            )}
          </nav>

          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              {error}
              <button style={{ marginLeft: 12 }} onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* ── Vue : liste des clients ── */}
          {view === 'clients' && (
            <>
              <div className="projects-page-topbar">
                <div>
                  <h1 className="projects-page-heading">Référentiel clients</h1>
                  <p className="projects-page-sub">
                    {clientsLoading
                      ? 'Chargement…'
                      : `${filteredClients.length} client${filteredClients.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <button className="primary projects-page-new" onClick={() => setClientModal('create')}>
                  + Nouveau client
                </button>
              </div>

              <div className="projects-search-bar">
                <input
                  type="search"
                  className="projects-search-input"
                  placeholder="Rechercher un client par nom ou code…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {!clientsLoading && filteredClients.length === 0 && (
                <div className="projects-page-empty">
                  <div className="projects-page-empty-icon">🏢</div>
                  <p>{search ? 'Aucun client ne correspond à votre recherche.' : 'Aucun client pour l\'instant.'}</p>
                  {!search && (
                    <button className="primary" onClick={() => setClientModal('create')}>
                      Créer votre premier client
                    </button>
                  )}
                </div>
              )}

              <div className="ref-clients-grid">
                {filteredClients.map(client => (
                  <div key={client.id} className="ref-client-card">
                    <div className="ref-client-card-body" onClick={() => void openClient(client)}>
                      <div className="ref-client-card-top">
                        {client.logo_url
                          ? <img src={client.logo_url} alt={client.name} className="ref-client-logo" />
                          : <div className="ref-client-logo-placeholder">{client.name[0].toUpperCase()}</div>
                        }
                        <div className="ref-client-card-identity">
                          {client.code && <span className="ref-client-code">{client.code}</span>}
                          <div className="ref-client-name">{client.name}</div>
                        </div>
                      </div>
                      {client.address && <div className="ref-client-address">{client.address}</div>}
                      {(client.phone || client.email) && (
                        <div className="ref-client-contacts">
                          {client.phone && <span>{client.phone}</span>}
                          {client.email && <span>{client.email}</span>}
                        </div>
                      )}
                    </div>
                    <div className="ref-client-card-actions">
                      <button onClick={() => setClientModal(client)} title="Modifier">
                        Modifier
                      </button>
                      <button
                        className="danger"
                        onClick={() => void handleDeleteClient(client)}
                        title="Supprimer"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Vue : détail client (sites + salles) ── */}
          {view === 'client' && selectedClient && (
            <>
              <div className="projects-page-topbar">
                <div>
                  <h1 className="projects-page-heading">{selectedClient.name}</h1>
                  {selectedClient.address && (
                    <p className="projects-page-sub">{selectedClient.address}</p>
                  )}
                  {selectedClient.code && (
                    <p className="projects-page-sub ref-siret-row">
                      <span className="ref-siret-label">SIRET</span>
                      <span className="ref-siret-value">{selectedClient.code}</span>
                      {selectedClient.code.replace(/\s/g, '').length === 14 && (
                        <a
                          href={`https://www.infogreffe.fr/entreprise/${selectedClient.code.replace(/\s/g, '').slice(0, 9)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ref-infogreffe-link"
                        >
                          🔍 Fiche Infogreffe
                        </a>
                      )}
                    </p>
                  )}
                </div>
                <div className="projects-page-topbar-actions">
                  <button onClick={() => setClientModal(selectedClient)}>Modifier le client</button>
                  <button className="primary projects-page-new" onClick={() => setSiteModal('create')}>
                    + Nouveau site
                  </button>
                </div>
              </div>

              {/* Contacts du client */}
              <div className="ref-section-block">
                <ContactsSection entityType="client" entityId={selectedClient.id} />
              </div>

              {sitesLoading ? (
                <div className="ref-loading">Chargement des sites…</div>
              ) : sites.length === 0 ? (
                <div className="projects-page-empty">
                  <div className="projects-page-empty-icon">🏗</div>
                  <p>Aucun site pour ce client.</p>
                  <button className="primary" onClick={() => setSiteModal('create')}>
                    Créer le premier site
                  </button>
                </div>
              ) : (
                <div className="ref-sites-list">
                  {sites.map(site => {
                    const rooms = roomsMap[site.id] ?? []
                    return (
                      <div key={site.id} className="ref-site-card">
                        <div className="ref-site-card-header">
                          <div className="ref-site-card-info">
                            <span className="ref-site-name">🏗 {site.name}</span>
                            {site.address && <span className="ref-site-address">{site.address}</span>}
                          </div>
                          <div className="ref-site-card-actions">
                            <button onClick={() => setSiteModal(site)} title="Modifier le site">
                              Modifier
                            </button>
                            <button
                              className="ref-add-btn"
                              onClick={() => setRoomModal({ mode: 'create', siteId: site.id })}
                              title="Ajouter une salle"
                            >
                              + Salle
                            </button>
                            <button
                              className="danger"
                              onClick={() => void handleDeleteSite(site)}
                              title="Supprimer le site"
                            >
                              🗑
                            </button>
                          </div>
                        </div>

                        <div className="ref-rooms-list">
                          {rooms.length === 0 ? (
                            <span className="ref-empty-hint">Aucune salle — cliquez sur + Salle pour en ajouter</span>
                          ) : (
                            rooms.map(room => (
                              <button
                                key={room.id}
                                className="ref-room-chip"
                                onClick={() => { setSelectedRoom(room); setSelectedRoomSite(site) }}
                                title={`${room.name}${room.type ? ` — ${room.type}` : ''}`}
                              >
                                <span className="ref-room-chip-icon">🚪</span>
                                <span className="ref-room-chip-name">{room.name}</span>
                                {room.type && <span className="ref-room-chip-type">{room.type}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Panneau détail salle ── */}
      {selectedRoom && selectedRoomSite && selectedClient && (
        <RoomPanel
          room={selectedRoom}
          site={selectedRoomSite}
          client={selectedClient}
          onClose={() => { setSelectedRoom(null); setSelectedRoomSite(null) }}
          onRoomUpdated={updated => {
            setSelectedRoom(updated)
            setRoomsMap(prev => ({
              ...prev,
              [updated.site_id]: (prev[updated.site_id] ?? [])
                .map(r => r.id === updated.id ? updated : r),
            }))
          }}
          onRoomDeleted={() => {
            if (selectedRoom) {
              setRoomsMap(prev => ({
                ...prev,
                [selectedRoom.site_id]: (prev[selectedRoom.site_id] ?? [])
                  .filter(r => r.id !== selectedRoom.id),
              }))
            }
            setSelectedRoom(null)
            setSelectedRoomSite(null)
          }}
          onNewProject={onNewProjectFromRoom}
          onOpenProject={onOpenProject}
        />
      )}

      {/* ── Modal Client ── */}
      {clientModal !== null && (
        <Modal
          title={clientModal === 'create' ? 'Nouveau client' : `Modifier — ${clientModal.name}`}
          onClose={() => setClientModal(null)}
        >
          <ClientForm
            initial={clientModal === 'create' ? undefined : clientModal}
            clientId={clientModal === 'create' ? undefined : clientModal.id}
            onSave={clientModal === 'create' ? handleCreateClient : handleUpdateClient}
            onLogoUploaded={(url, path) => {
              if (clientModal === 'create') return
              const updated = { ...clientModal, logo_url: url || null, logo_storage_path: path || null }
              setClients(prev => prev.map(c => c.id === updated.id ? updated as Client : c))
              if (selectedClient?.id === updated.id) setSelectedClient(updated as Client)
            }}
            onCancel={() => setClientModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Site ── */}
      {siteModal !== null && (
        <Modal
          title={siteModal === 'create' ? 'Nouveau site' : `Modifier — ${siteModal.name}`}
          onClose={() => setSiteModal(null)}
        >
          <SiteForm
            initial={siteModal === 'create' ? undefined : siteModal}
            onSave={siteModal === 'create' ? handleCreateSite : handleUpdateSite}
            onCancel={() => setSiteModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Salle ── */}
      {roomModal !== null && (
        <Modal
          title={roomModal.mode === 'create' ? 'Nouvelle salle' : `Modifier — ${roomModal.room.name}`}
          onClose={() => setRoomModal(null)}
        >
          <RoomForm
            initial={roomModal.mode === 'edit' ? roomModal.room : undefined}
            onSave={roomModal.mode === 'create' ? handleCreateRoom : handleUpdateRoom}
            onCancel={() => setRoomModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Mon compte ── */}
      {accountOpen && <AdminSettings onClose={() => setAccountOpen(false)} />}
    </div>
  )
}
