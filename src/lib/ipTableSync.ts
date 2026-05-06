import type {
  IPTableRow,
  PlacedProduct,
  Product,
  Tab,
} from '../types'
import { isSynopticTab } from '../types'

/** Génère un ID interne stable pour une ligne. */
function newRowId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ip-${Math.random().toString(36).slice(2, 10)}`
}

/** Crée une ligne vide (pour l'ajout manuel ou la base d'un sync). */
export function makeEmptyRow(manual = true): IPTableRow {
  return {
    id: newRowId(),
    productInstanceIds: [],
    manual,
    product: '',
    label: '',
    deviceId: '',
    ip: '',
    ipDante: '',
    ipDanteSec: '',
    login: '',
    password: '',
    serialNumber: '',
    mac: '',
    macDante: '',
  }
}

/** Représentation aplatie d'un nœud + son produit, utilisée par la sync. */
interface FlatNode {
  node: PlacedProduct
  product: Product | undefined
}

/** Aplatit tous les nœuds de tous les onglets synoptiques d'un projet. */
function flattenSynopticNodes(tabs: Tab[], products: Product[]): FlatNode[] {
  const out: FlatNode[] = []
  for (const tab of tabs) {
    if (!isSynopticTab(tab)) continue
    for (const node of tab.nodes ?? []) {
      out.push({
        node,
        product: products.find((p) => p.id === node.productId),
      })
    }
  }
  return out
}

/** Étiquette propre du produit pour la colonne PRODUIT. */
function productLabelFor(node: PlacedProduct, product: Product | undefined): string {
  if (product) return `${product.manufacturer} ${product.reference}`.trim()
  return node.name || 'Produit inconnu'
}

/**
 * Synchronise les lignes du Tableau IP avec l'état des onglets synoptiques.
 *
 * Règles :
 * - Seuls les nœuds qui ont un LABEL non vide sont injectés.
 * - Dédoublonnage par LABEL (insensible casse + espaces) : si plusieurs nœuds
 *   ont le même LABEL, ils sont fusionnés en une seule ligne et leurs ids
 *   accumulés dans `productInstanceIds`.
 * - Les lignes manuelles existantes (manual=true) sont entièrement préservées.
 * - Pour les lignes auto existantes :
 *   • si encore présentes (au moins un instanceId encore valide ou un label
 *     toujours utilisé), les colonnes saisies à la main (IP, login, etc.)
 *     sont conservées et les colonnes auto (PRODUIT, LABEL, productInstanceIds)
 *     sont rafraîchies.
 *   • si elles ne correspondent plus à aucun nœud, elles sont retirées.
 * - Les nouveaux LABELs détectés génèrent une ligne vierge.
 */
export function syncIPRowsFromSynoptics(
  existing: IPTableRow[],
  tabs: Tab[],
  products: Product[],
): IPTableRow[] {
  const flat = flattenSynopticNodes(tabs, products)

  // 1. Regrouper les nœuds par LABEL (uniquement ceux qui en ont un)
  const byLabel = new Map<string, FlatNode[]>()
  for (const f of flat) {
    const lbl = (f.node.label ?? '').trim()
    if (!lbl) continue
    const key = lbl.toLowerCase()
    const arr = byLabel.get(key) ?? []
    arr.push(f)
    byLabel.set(key, arr)
  }

  // 2. Map des lignes existantes par "clé d'instance" et par label
  //    Une ligne existante peut être retrouvée par :
  //    - n'importe quel productInstanceId qu'elle contient
  //    - à défaut, son label normalisé
  const existingByInstanceId = new Map<string, IPTableRow>()
  const existingByLabelLc = new Map<string, IPTableRow>()
  for (const row of existing) {
    for (const iid of row.productInstanceIds) {
      existingByInstanceId.set(iid, row)
    }
    if (row.label.trim()) {
      existingByLabelLc.set(row.label.trim().toLowerCase(), row)
    }
  }

  // 3. Conserver toutes les lignes manuelles intactes
  const manualRows = existing.filter((r) => r.manual)

  // 4. Pour chaque groupe LABEL → produire une ligne (mise à jour ou créée)
  const autoRows: IPTableRow[] = []
  const consumedRowIds = new Set<string>()

  for (const [labelLc, group] of byLabel.entries()) {
    const label = group[0].node.label!.trim()
    const instanceIds = group.map((g) => g.node.id)

    // Chercher une ligne existante non-manuelle déjà liée à un de ces IDs
    let existingRow: IPTableRow | undefined
    for (const iid of instanceIds) {
      const candidate = existingByInstanceId.get(iid)
      if (candidate && !candidate.manual) {
        existingRow = candidate
        break
      }
    }
    // Sinon, fallback par label
    if (!existingRow) {
      const byLbl = existingByLabelLc.get(labelLc)
      if (byLbl && !byLbl.manual) existingRow = byLbl
    }

    // Décrire le produit (premier du groupe — tous identiques en pratique)
    const productLabel = productLabelFor(group[0].node, group[0].product)

    if (existingRow) {
      consumedRowIds.add(existingRow.id)
      // Préserver les saisies manuelles, rafraîchir l'auto
      autoRows.push({
        ...existingRow,
        product: productLabel,
        label,
        productInstanceIds: instanceIds,
      })
    } else {
      autoRows.push({
        ...makeEmptyRow(false),
        product: productLabel,
        label,
        productInstanceIds: instanceIds,
      })
    }
  }

  // 5. Les lignes auto existantes qui n'ont PAS été consommées sont retirées
  //    (leur produit n'existe plus dans les synoptiques OU n'a plus de LABEL)
  return [...manualRows, ...autoRows]
}

/**
 * Cherche dans les onglets quels nœuds correspondent aux instanceIds donnés
 * et retourne les paires {tabId, nodeId} à mettre à jour.
 * Utilisé quand on modifie un LABEL dans le Tableau IP : on doit propager
 * le changement à toutes les occurrences synoptiques.
 */
export function findNodesByInstanceIds(
  tabs: Tab[],
  instanceIds: string[],
): { tabId: string; nodeId: string }[] {
  if (instanceIds.length === 0) return []
  const ids = new Set(instanceIds)
  const result: { tabId: string; nodeId: string }[] = []
  for (const tab of tabs) {
    if (!isSynopticTab(tab)) continue
    for (const node of tab.nodes ?? []) {
      if (ids.has(node.id)) result.push({ tabId: tab.id, nodeId: node.id })
    }
  }
  return result
}

/**
 * Détecte les doublons d'IP à travers les colonnes IP / IP DANTE / IP DANTE SEC.
 * Retourne une Map row.id → Set<colonne> des cellules en doublon.
 *
 * Fonction PURE : ne modifie jamais `rows`, ne déclenche aucun side-effect.
 */
export type IPColumn = 'ip' | 'ipDante' | 'ipDanteSec'

export function detectIPDuplicates(
  rows: IPTableRow[],
): Map<string, Set<IPColumn>> {
  const cols: IPColumn[] = ['ip', 'ipDante', 'ipDanteSec']
  // Compter chaque IP non-vide à travers toutes les lignes & colonnes
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const col of cols) {
      const v = (row[col] ?? '').trim()
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
  }
  // Marquer les cellules avec une valeur en doublon
  const dups = new Map<string, Set<IPColumn>>()
  for (const row of rows) {
    for (const col of cols) {
      const v = (row[col] ?? '').trim()
      if (!v) continue
      if ((counts.get(v) ?? 0) > 1) {
        const set = dups.get(row.id) ?? new Set<IPColumn>()
        set.add(col)
        dups.set(row.id, set)
      }
    }
  }
  return dups
}

// ─────────────────────────────────────────────────────────────────────
// Helpers purs pour les vues dérivées du Tableau IP
// (filtres + sort + duplicate-only + dédup défensive sur l'id)
// ─────────────────────────────────────────────────────────────────────

/** Retire défensivement les lignes ayant un id déjà vu. Garantit que le
 *  tableau visible ne contient JAMAIS deux fois la même clé React. */
export function dedupeRowsById(rows: IPTableRow[]): IPTableRow[] {
  const seen = new Set<string>()
  const out: IPTableRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}

/** Applique les filtres par colonne sur une copie. Ne mute jamais l'entrée. */
export function applyRowFilters<C extends string>(
  rows: IPTableRow[],
  filters: Record<C, string>,
  columnKeys: C[],
): IPTableRow[] {
  let list = rows
  for (const key of columnKeys) {
    const f = (filters[key] ?? '').trim().toLowerCase()
    if (!f) continue
    list = list.filter((r) =>
      String((r as unknown as Record<string, unknown>)[key] ?? '')
        .toLowerCase()
        .includes(f),
    )
  }
  return list
}

/** Garde uniquement les lignes en doublon IP. */
export function filterDuplicateIpRows(
  rows: IPTableRow[],
  duplicates: Map<string, Set<IPColumn>>,
): IPTableRow[] {
  return rows.filter((r) => duplicates.has(r.id))
}

/** Retourne une COPIE triée — n'altère jamais `rows`. */
export function applySort<C extends string>(
  rows: IPTableRow[],
  sortKey: C | null,
  sortDir: 'asc' | 'desc',
): IPTableRow[] {
  if (!sortKey) return rows
  const copy = [...rows]
  copy.sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortKey] ?? ''
    const bv = (b as unknown as Record<string, unknown>)[sortKey] ?? ''
    const cmp = String(av).localeCompare(String(bv), 'fr', { numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })
  return copy
}
