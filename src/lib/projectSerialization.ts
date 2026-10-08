import type { ProjectData } from './projectsApi'
import type { Tab } from '../types'

/** Calcule un hash léger de l'état (pour détecter les vraies modifications) */
export function computeProjectHash(
  tabs: unknown,
  products: unknown,
  signals: unknown,
  accessories?: unknown,
  zones?: unknown,
): string {
  const str = JSON.stringify({ tabs, products, signals, accessories, zones })
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return `${str.length}:${h}`
}

/** Construit deux empreintes de l'état du projet :
 *  - `base`  : contenu versionnable (onglets, produits, signaux, accessoires, zones)
 *              → sert à décider de l'incrément de version (inchangé vs aujourd'hui).
 *  - `full`  : base + colonnes Tableau IP + métadonnées cartouche + nom du projet
 *              → sert à la détection « modifié » de l'auto-save (ne rien perdre). */
export function buildSignature(
  flushedTabs: unknown,
  state: {
    products: unknown; signals: unknown; accessories: unknown; zones: unknown;
    ipTableColumns: unknown; projectMeta: unknown; currentProjectName: string;
  },
): { base: string; full: string } {
  const base = computeProjectHash(flushedTabs, state.products, state.signals, state.accessories, state.zones);
  const full = `${base}|${JSON.stringify(state.ipTableColumns)}|${JSON.stringify(state.projectMeta)}|${JSON.stringify(state.currentProjectName)}`;
  return { base, full };
}

/** Sauvegarde portable : aucun identifiant cloud ni droit de partage. */
export function createProjectExport(
  state: Omit<ProjectData, 'tabs'> & { currentProjectName: string; zones: NonNullable<ProjectData['zones']> },
  tabs: Tab[],
): ProjectData & { formatVersion: number; name: string } {
  return {
    formatVersion: 2,
    name: state.currentProjectName,
    tabs,
    activeTabId: state.activeTabId,
    projectMeta: state.projectMeta,
    signals: state.signals,
    zones: state.zones,
    products: state.products,
    accessories: state.accessories,
    ipTableColumns: state.ipTableColumns,
  }
}
