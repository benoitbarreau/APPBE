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
  flushedTabs: Tab[],
  state: {
    products: { id: string }[]; signals: unknown; accessories: unknown; zones: unknown;
    ipTableColumns: unknown; projectMeta: unknown; currentProjectName: string;
  },
): { base: string; full: string } {
  // Seuls les produits utilisés comptent (ce sont eux qu'on enregistre) : sérialiser
  // tout le catalogue toutes les 2 s coûtait cher, et une fiche du catalogue
  // modifiée ailleurs marquait à tort le projet « modifié ».
  const products = usedProducts(flushedTabs, state.products);
  const base = computeProjectHash(flushedTabs, products, state.signals, state.accessories, state.zones);
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

/** Produits réellement utilisés par le projet : nœuds des synoptiques et
 *  équipements des baies (format multi-baies et ancien format). Seuls ceux-là
 *  sont enregistrés avec le projet : le catalogue complet (produits en attente
 *  de modération d'autres comptes compris) ne part plus chez les destinataires
 *  d'un partage. */
export function usedProducts<P extends { id: string }>(tabs: Tab[], products: P[]): P[] {
  const ids = new Set<string>()
  for (const tab of tabs) {
    for (const node of tab.nodes ?? []) if (node.productId) ids.add(node.productId)
    for (const rack of tab.racks ?? []) for (const item of rack.items ?? []) if (item.productId) ids.add(item.productId)
    for (const item of tab.bayItems ?? []) if (item.productId) ids.add(item.productId)
  }
  return products.filter((p) => ids.has(p.id))
}

/** Copie des onglets sans les mots de passe des équipements (Tableau IP). */
export function redactPasswords(tabs: Tab[]): Tab[] {
  return tabs.map((tab) =>
    tab.rows ? { ...tab, rows: tab.rows.map((row) => ({ ...row, password: '' })) } : tab,
  )
}
