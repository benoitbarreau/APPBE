// ── Composant modal générique ──────────────────────────────────────────────

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="ref-modal-overlay" onClick={onClose}>
      <div className="ref-modal" onClick={e => e.stopPropagation()}>
        <div className="ref-modal-header">
          <h3 className="ref-modal-title">{title}</h3>
          <button className="ref-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ref-modal-body">{children}</div>
      </div>
    </div>
  )
}
