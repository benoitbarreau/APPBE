import { useState } from 'react'
import type { CatalogCategory } from '../../lib/catalogMetaApi'
import { ColorPickerPopover } from './ColorPickerPopover'

// ── Ligne d'édition d'une catégorie ─────────────────────────────────────────
export function CategoryRow({
  category, onSave, onDelete,
}: {
  category: CatalogCategory
  onSave: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) { setEditing(false); return }
    setBusy(true)
    await onSave(category.id, name.trim(), color)
    setBusy(false)
    setEditing(false)
  }

  return (
    <div className="catmeta-row">
      <span
        className="catmeta-color-dot"
        style={{ background: category.color }}
        title={category.color}
      />
      {editing ? (
        <div className="catmeta-edit-group">
          <input
            className="catmeta-input"
            value={name}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(category.name); setColor(category.color); setEditing(false) } }}
          />
          <ColorPickerPopover value={color} onChange={setColor} />
        </div>
      ) : (
        <span className="catmeta-name">{category.name}</span>
      )}
      <div className="catmeta-actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()} disabled={busy}>✓</button>
            <button onClick={() => { setName(category.name); setColor(category.color); setEditing(false) }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Modifier">✎</button>
            <button className="danger" onClick={() => void onDelete(category.id)} title="Supprimer">🗑</button>
          </>
        )}
      </div>
    </div>
  )
}
