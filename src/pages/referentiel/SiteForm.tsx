import { useEffect, useRef, useState } from 'react'
import type { Site } from '../../lib/referentielApi'

// ── Formulaire Site ────────────────────────────────────────────────────────

interface SiteFormProps {
  initial?: Partial<Site>
  onSave: (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export function SiteForm({ initial, onSave, onCancel, saving }: SiteFormProps) {
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
