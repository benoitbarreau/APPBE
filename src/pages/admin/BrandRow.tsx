import { useState } from 'react'
import type { CatalogBrand } from '../../lib/catalogMetaApi'

// ── Ligne d'édition d'une marque ────────────────────────────────────────────
export function BrandRow({
  brand, onSave, onDelete,
}: {
  brand: CatalogBrand
  onSave: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(brand.name)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim() || name.trim() === brand.name) { setEditing(false); return }
    setBusy(true)
    await onSave(brand.id, name.trim())
    setBusy(false)
    setEditing(false)
  }

  return (
    <div className="catmeta-row">
      {editing ? (
        <input
          className="catmeta-input"
          value={name}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(brand.name); setEditing(false) } }}
        />
      ) : (
        <span className="catmeta-name">{brand.name}</span>
      )}
      <div className="catmeta-actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()} disabled={busy}>✓</button>
            <button onClick={() => { setName(brand.name); setEditing(false) }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Renommer">✎</button>
            <button className="danger" onClick={() => void onDelete(brand.id)} title="Supprimer">🗑</button>
          </>
        )}
      </div>
    </div>
  )
}
