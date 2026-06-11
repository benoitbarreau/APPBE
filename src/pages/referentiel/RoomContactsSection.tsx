import { useEffect, useState } from 'react'
import {
  listContacts, listRoomContacts, addRoomContact, removeRoomContact,
  type Contact, type Room,
} from '../../lib/referentielApi'
import { confirmDialog } from '../../components/dialogs/dialogStore'
import { Modal } from './Modal'

// ── Contacts assignés à une salle (sélection depuis les contacts client) ──

interface RoomContactsSectionProps {
  room: Room
  clientId: string
}

export function RoomContactsSection({ room, clientId }: RoomContactsSectionProps) {
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
    const ok = await confirmDialog({
      title: `Retirer ${c.first_name} ${c.last_name} de cette salle ?`,
      message: 'Le contact reste disponible dans la fiche client.',
      confirmLabel: 'Retirer',
      danger: true,
    })
    if (!ok) return
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
