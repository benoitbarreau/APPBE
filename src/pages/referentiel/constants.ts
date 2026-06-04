import type { DocType } from '../../lib/referentielApi'

// ── Icônes, libellés et descriptions des types de documents ─────────────────
export const DOC_ICONS: Record<DocType, string> = {
  pdf: '📄',
  image: '🖼',
  link: '🔗',
  project_export: '📐',
}

export const DOC_LABELS: Record<DocType, string> = {
  pdf: 'PDF',
  image: 'Image',
  link: 'Lien externe',
  project_export: 'Export SynoX',
}

export const DOC_DESCS: Record<DocType, string> = {
  link: 'SharePoint, OneDrive…',
  pdf: 'Fichier PDF',
  image: 'Photo, plan, schéma',
  project_export: 'Export ou lien SynoX',
}

// ── Types de salles proposés ────────────────────────────────────────────────
export const ROOM_TYPES = ['Salle de réunion', 'Salle de conférence', 'Auditorium', 'Salle de formation',
  'Studio', 'Régie', 'Salle de contrôle', 'Open-space', 'Couloir', 'Hall', 'Autre']
