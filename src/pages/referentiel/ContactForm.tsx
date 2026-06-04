import { useEffect, useRef, useState } from 'react'
import type { Contact } from '../../lib/referentielApi'

// ── Formulaire Contact ─────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: Partial<Contact>
  onSave: (data: Omit<Contact, 'id' | 'entity_type' | 'entity_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export function ContactForm({ initial, onSave, onCancel, saving }: ContactFormProps) {
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
