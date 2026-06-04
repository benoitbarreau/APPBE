import { useEffect, useRef, useState } from 'react'
import type { Room } from '../../lib/referentielApi'
import { ROOM_TYPES } from './constants'

// ── Formulaire Salle ───────────────────────────────────────────────────────

interface RoomFormProps {
  initial?: Partial<Room>
  onSave: (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export function RoomForm({ initial, onSave, onCancel, saving }: RoomFormProps) {
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
