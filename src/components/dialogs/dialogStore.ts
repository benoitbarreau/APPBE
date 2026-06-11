import { create } from 'zustand'

// ── Système de dialogues de l'application ───────────────────────────────────
// Remplace les confirm() / alert() natifs du navigateur par des composants
// stylés. Deux fonctions à utiliser partout dans l'app :
//
//   const ok = await confirmDialog({ title: 'Supprimer X ?', danger: true })
//   notify('Sauvegardé !', 'success')
//
// Le rendu est assuré par <DialogHost /> monté une seule fois dans main.tsx.

export interface ConfirmOptions {
  /** Question principale, courte (ex. « Supprimer cette marque ? ») */
  title: string
  /** Détail optionnel affiché sous le titre (peut contenir des \n) */
  message?: string
  /** Libellé du bouton de confirmation (défaut : « Confirmer ») */
  confirmLabel?: string
  /** Libellé du bouton d'annulation (défaut : « Annuler ») */
  cancelLabel?: string
  /** true → bouton de confirmation rouge + icône ⚠️ (actions destructives) */
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface DialogState {
  confirmRequest: ConfirmRequest | null
  toasts: Toast[]
}

export const useDialogStore = create<DialogState>(() => ({
  confirmRequest: null,
  toasts: [],
}))

/** Affiche une boîte de confirmation stylée. Résout `true` si l'utilisateur
 *  confirme, `false` s'il annule (bouton, clic hors boîte ou touche Échap). */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    // Si une confirmation était déjà ouverte, on l'annule proprement
    useDialogStore.getState().confirmRequest?.resolve(false)
    useDialogStore.setState({ confirmRequest: { ...options, resolve } })
  })
}

/** Ferme la confirmation en cours avec la réponse donnée (usage interne DialogHost). */
export function resolveConfirm(ok: boolean) {
  const req = useDialogStore.getState().confirmRequest
  if (!req) return
  useDialogStore.setState({ confirmRequest: null })
  req.resolve(ok)
}

let toastSeq = 0

/** Affiche une notification temporaire (toast) en bas à droite.
 *  Disparaît seule : 4 s (info/succès) ou 8 s (erreur). */
export function notify(message: string, kind: ToastKind = 'info') {
  const id = ++toastSeq
  useDialogStore.setState(s => ({ toasts: [...s.toasts, { id, message, kind }] }))
  const duration = kind === 'error' ? 8000 : 4000
  setTimeout(() => dismissToast(id), duration)
}

/** Retire un toast de la pile (clic sur ✕ ou expiration du délai). */
export function dismissToast(id: number) {
  useDialogStore.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}
