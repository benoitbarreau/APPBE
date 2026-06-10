import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import {
  listDocuments, createDocument, deleteDocument,
  uploadDocument, getSignedUrl, deleteStorageFile,
  listProjectsByRoom, linkProjectToRoom,
  updateRoom, deleteRoom,
  type Room, type Site, type Client, type RefDocument, type DocType, type LinkedProject,
} from '../../lib/referentielApi'
import { listProjects } from '../../lib/projectsApi'
import type { ProjectRow } from '../../lib/projectsApi'
import { RoomForm } from './RoomForm'
import { RoomContactsSection } from './RoomContactsSection'
import { DOC_ICONS, DOC_LABELS, DOC_DESCS } from './constants'

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

export function RoomPanel({ room, site, client, onClose, onRoomUpdated, onRoomDeleted, onNewProject, onOpenProject }: RoomPanelProps) {
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
      .catch((e) => console.error('Échec chargement projets liés :', e))
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
      if (doc.storage_path) await deleteStorageFile(doc.storage_path).catch((e) => console.error('Échec suppression fichier du storage :', doc.storage_path, e))
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
                    listProjects(false).then(setAllProjects).catch((e) => console.error('Échec chargement liste projets :', e))
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
