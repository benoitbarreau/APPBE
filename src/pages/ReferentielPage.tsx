import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  listClients, createClient, updateClient, deleteClient,
  listSites, createSite, updateSite, deleteSite,
  listRooms, createRoom, updateRoom, deleteRoom,
  listDocuments, createDocument, deleteDocument,
  uploadDocument, getSignedUrl, deleteStorageFile,
  listProjectsByRoom,
  type Client, type Site, type Room, type RefDocument, type DocType, type LinkedProject,
} from '../lib/referentielApi'
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

const ROOM_TYPES = ['Salle de réunion', 'Salle de conférence', 'Auditorium', 'Salle de formation',
  'Studio', 'Régie', 'Salle de contrôle', 'Open-space', 'Couloir', 'Hall', 'Autre']

interface Props {
  onOpenProjects: () => void
  onOpenAdminDashboard?: () => void
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

// ── Formulaire Client ──────────────────────────────────────────────────────

interface ClientFormProps {
  initial?: Partial<Client>
  onSave: (data: Omit<Client, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function ClientForm({ initial, onSave, onCancel, saving }: ClientFormProps) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [code, setCode]       = useState(initial?.code ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone]     = useState(initial?.phone ?? '')
  const [email, setEmail]     = useState(initial?.email ?? '')
  const [notes, setNotes]     = useState(initial?.notes ?? '')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSave({
      name: name.trim(),
      code: code.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form className="ref-form" onSubmit={e => void handleSubmit(e)}>
      <label>Nom du client *
        <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client" required />
      </label>
      <label>Code / Référence
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Ex : CLI-001" />
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

// ── Panneau de détail d'une salle ─────────────────────────────────────────

interface RoomPanelProps {
  room: Room
  site: Site
  client: Client
  onClose: () => void
  onRoomUpdated: (updated: Room) => void
  onRoomDeleted: () => void
}

function RoomPanel({ room, site, client, onClose, onRoomUpdated, onRoomDeleted }: RoomPanelProps) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [savingRoom, setSavingRoom] = useState(false)
  const [docs, setDocs] = useState<RefDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([])
  const [projLoading, setProjLoading] = useState(true)
  const [addDocOpen, setAddDocOpen] = useState(false)
  const [docType, setDocType] = useState<DocType>('link')
  const [docName, setDocName] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(false)
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
    if (!docName.trim()) return
    setError(null)
    setUploadProgress(true)
    try {
      let url: string | null = docUrl.trim() || null
      let storagePath: string | null = null
      let fileSize: number | null = null

      if ((docType === 'pdf' || docType === 'image') && docFile && user) {
        const result = await uploadDocument(user.id, 'room', room.id, docFile)
        storagePath = result.storagePath
        fileSize = docFile.size
        url = result.publicUrl
      }

      const doc = await createDocument({
        entity_type: 'room',
        entity_id: room.id,
        name: docName.trim(),
        doc_type: docType,
        url,
        storage_path: storagePath,
        file_size: fileSize,
      })
      setDocs(prev => [doc, ...prev])
      setAddDocOpen(false)
      setDocName('')
      setDocUrl('')
      setDocFile(null)
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
      let target = doc.url
      if (doc.storage_path && !doc.url?.startsWith('http')) {
        target = await getSignedUrl(doc.storage_path)
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
                    <span className="ref-room-info-value">{room.type}</span>
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

          {/* Projets SynoX liés */}
          <div className="ref-room-panel-section">
            <h4 className="ref-section-title">Projets SynoX liés</h4>
            {projLoading ? (
              <p className="ref-loading-hint">Chargement…</p>
            ) : linkedProjects.length === 0 ? (
              <p className="ref-empty-hint">Aucun projet associé à cette salle.</p>
            ) : (
              <ul className="ref-linked-projects">
                {linkedProjects.map(p => (
                  <li key={p.id} className="ref-linked-project-item">
                    <span className="ref-linked-project-icon">📐</span>
                    <span className="ref-linked-project-name">{p.name}</span>
                    <span className="ref-linked-project-date">{fmt(p.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Documents */}
          <div className="ref-room-panel-section">
            <div className="ref-section-header">
              <h4 className="ref-section-title">Documents</h4>
              <button
                className="ref-add-btn"
                onClick={() => { setAddDocOpen(v => !v); setDocName(''); setDocUrl(''); setDocFile(null) }}
              >
                {addDocOpen ? 'Annuler' : '+ Ajouter'}
              </button>
            </div>

            {addDocOpen && (
              <form className="ref-add-doc-form" onSubmit={e => void handleAddDoc(e)}>
                <div className="ref-form-row">
                  <label style={{ flex: 1 }}>Type
                    <select value={docType} onChange={e => { setDocType(e.target.value as DocType); setDocFile(null) }}>
                      <option value="link">🔗 Lien externe</option>
                      <option value="pdf">📄 PDF</option>
                      <option value="image">🖼 Image</option>
                      <option value="project_export">📐 Export SynoX</option>
                    </select>
                  </label>
                  <label style={{ flex: 2 }}>Nom *
                    <input
                      value={docName}
                      onChange={e => setDocName(e.target.value)}
                      placeholder="Nom du document"
                      required
                    />
                  </label>
                </div>
                {docType === 'link' || docType === 'project_export' ? (
                  <label>URL
                    <input
                      type="url"
                      value={docUrl}
                      onChange={e => setDocUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                ) : (
                  <label>Fichier
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={docType === 'pdf' ? '.pdf' : 'image/*'}
                      onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                <div className="ref-form-actions">
                  <button type="submit" className="primary" disabled={uploadProgress || !docName.trim()}>
                    {uploadProgress ? 'Upload…' : 'Ajouter'}
                  </button>
                </div>
              </form>
            )}

            {docsLoading ? (
              <p className="ref-loading-hint">Chargement…</p>
            ) : docs.length === 0 && !addDocOpen ? (
              <p className="ref-empty-hint">Aucun document. Cliquez sur + Ajouter pour en attacher un.</p>
            ) : (
              <ul className="ref-doc-list">
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

export function ReferentielPage({ onOpenProjects, onOpenAdminDashboard }: Props) {
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
                      {client.code && <span className="ref-client-code">{client.code}</span>}
                      <div className="ref-client-name">{client.name}</div>
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
                </div>
                <div className="projects-page-topbar-actions">
                  <button onClick={() => setClientModal(selectedClient)}>Modifier le client</button>
                  <button className="primary projects-page-new" onClick={() => setSiteModal('create')}>
                    + Nouveau site
                  </button>
                </div>
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
            onSave={clientModal === 'create' ? handleCreateClient : handleUpdateClient}
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
