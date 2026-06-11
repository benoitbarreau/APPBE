import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listContacts, createContact, updateContact, deleteContact,
  type Contact, type ContactEntityType,
} from '../../lib/referentielApi'
import { confirmDialog } from '../../components/dialogs/dialogStore'
import { Modal } from './Modal'
import { ContactForm } from './ContactForm'

// ── Section Contacts (réutilisable pour site et salle) ─────────────────────

interface ContactsSectionProps {
  entityType: ContactEntityType
  entityId: string
  /** Si true, les contacts sont masqués par défaut et chargés à la première ouverture */
  defaultCollapsed?: boolean
}

export function ContactsSection({ entityType, entityId, defaultCollapsed = false }: ContactsSectionProps) {
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
    const ok = await confirmDialog({
      title: `Supprimer le contact ${c.first_name} ${c.last_name} ?`,
      confirmLabel: '🗑 Supprimer',
      danger: true,
    })
    if (!ok) return
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
