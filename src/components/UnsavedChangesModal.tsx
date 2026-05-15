/**
 * Modal affiché quand l'utilisateur tente de quitter l'éditeur
 * avec des modifications non sauvegardées.
 *
 * Trois options :
 *  • Enregistrer  → sauvegarde puis navigue
 *  • Ignorer      → navigue sans sauvegarder
 *  • Annuler      → reste sur la page courante
 */

interface UnsavedChangesModalProps {
  saving: boolean
  onSaveAndLeave: () => void
  onIgnoreAndLeave: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({
  saving,
  onSaveAndLeave,
  onIgnoreAndLeave,
  onCancel,
}: UnsavedChangesModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal unsaved-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Modifications non sauvegardées</h2>
        </div>

        <div className="unsaved-modal-body">
          <p>
            Ce projet contient des modifications qui n'ont pas encore été
            enregistrées. Que souhaitez-vous faire ?
          </p>
        </div>

        <div className="unsaved-modal-footer">
          <button
            className="primary"
            disabled={saving}
            onClick={onSaveAndLeave}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button onClick={onIgnoreAndLeave} disabled={saving}>
            Ignorer
          </button>
          <button onClick={onCancel} disabled={saving}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
