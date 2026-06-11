import { useEffect } from 'react'
import { useDialogStore, resolveConfirm, dismissToast } from './dialogStore'

// ── Hôte des dialogues ───────────────────────────────────────────────────────
// Monté une seule fois dans main.tsx. Affiche la boîte de confirmation en
// cours et la pile de notifications (toasts) par-dessus toute l'application.

export function DialogHost() {
  const confirmRequest = useDialogStore(s => s.confirmRequest)
  const toasts = useDialogStore(s => s.toasts)

  // Échap = annuler la confirmation en cours
  useEffect(() => {
    if (!confirmRequest) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveConfirm(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [confirmRequest])

  return (
    <>
      {/* ── Boîte de confirmation ── */}
      {confirmRequest && (
        <div className="confirm-dialog-overlay" onClick={() => resolveConfirm(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
          >
            <div className="confirm-dialog-title">
              {confirmRequest.danger && <span className="confirm-dialog-warn-icon">⚠️</span>}
              {confirmRequest.title}
            </div>
            {confirmRequest.message && (
              <p className="confirm-dialog-message">{confirmRequest.message}</p>
            )}
            <div className="confirm-dialog-actions">
              <button onClick={() => resolveConfirm(false)}>
                {confirmRequest.cancelLabel ?? 'Annuler'}
              </button>
              <button
                className={confirmRequest.danger ? 'danger' : 'primary'}
                autoFocus
                onClick={() => resolveConfirm(true)}
              >
                {confirmRequest.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pile de notifications ── */}
      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast--${t.kind}`}>
              <span className="toast-icon">
                {t.kind === 'error' ? '⚠' : t.kind === 'success' ? '✓' : 'ℹ'}
              </span>
              <span className="toast-message">{t.message}</span>
              <button className="toast-close" onClick={() => dismissToast(t.id)} title="Fermer">✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
