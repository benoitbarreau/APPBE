import { useEffect, useRef, useState } from 'react'

// ── Menu ••• (CSV / Import) ────────────────────────────────────────────────
export function ActionsMenu({
  onExport,
  onImportClick,
}: {
  onExport: () => void
  onImportClick: () => void
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
    <div className="catalogue-actions-menu" ref={ref}>
      <button
        className={`catalogue-actions-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Actions"
      >
        •••
      </button>
      {open && (
        <div className="catalogue-actions-dropdown">
          <button onClick={() => { onExport(); setOpen(false) }}>↓ Exporter CSV</button>
          <button onClick={() => { onImportClick(); setOpen(false) }}>↑ Importer CSV</button>
        </div>
      )}
    </div>
  )
}
