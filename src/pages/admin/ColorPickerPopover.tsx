import { useEffect, useRef, useState } from 'react'

const PRESET_COLORS = [
  // ── Bleus & Verts ──────────────────────────────────────────
  '#3B82F6', '#2563EB', '#1D4ED8', '#0EA5E9', '#0284C7', '#06B6D4',
  '#10B981', '#059669', '#16A34A', '#22C55E', '#84CC16', '#65A30D',
  // ── Chauds : Jaune · Orange · Rouge ───────────────────────
  '#EAB308', '#CA8A04', '#F59E0B', '#D97706', '#F97316', '#EA580C',
  '#EF4444', '#DC2626', '#B91C1C', '#E11D48', '#F43F5E', '#FB7185',
  // ── Violets · Roses · Indigos ─────────────────────────────
  '#EC4899', '#DB2777', '#A21CAF', '#C026D3', '#D946EF', '#A855F7',
  '#9333EA', '#7C3AED', '#8B5CF6', '#6366F1', '#4F46E5', '#4338CA',
  // ── Teals · Neutres · Sombres ─────────────────────────────
  '#14B8A6', '#0D9488', '#0891B2', '#78716C', '#57534E', '#6B7280',
  '#4B5563', '#374151', '#1F2937', '#0F172A', '#92400E', '#7F1D1D',
]

// ── Sélecteur couleur avec popover ────────────────────────────────────────
export function ColorPickerPopover({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="color-picker-wrap" ref={ref}>
      <button
        className="color-picker-swatch"
        style={{ background: value }}
        onClick={() => setOpen(v => !v)}
        title="Choisir une couleur"
        type="button"
      />
      {open && (
        <div className="color-picker-popover">
          <div className="color-picker-presets">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className={`color-picker-dot${value === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false) }}
                title={c}
                type="button"
              />
            ))}
          </div>
          <div className="color-picker-custom-row">
            <span className="color-picker-custom-label">Couleur personnalisée :</span>
            <input
              type="color"
              value={value}
              onChange={e => onChange(e.target.value)}
              className="color-picker-input-native"
              title="Couleur libre"
            />
          </div>
        </div>
      )}
    </div>
  )
}
