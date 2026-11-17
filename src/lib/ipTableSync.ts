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
 *   • si elles ne correspondent plus à aucun nœud : retirées si elles sont
 *     vides, sinon gardées sans lien et marquées `orphan` (reprises si un
 *     produit de même référence et de même label revient).
 * - Les nouveaux LABELs détectés génèrent une ligne vierge.
 */
export function syncIPRowsFromSynoptics(
  existing: IPTableRow[],
  tabs: Tab[],
  products: Product[],
): IPTableRow[] {
  const flat = flattenSynopticNodes(tabs, products)

  // 1. Regrouper les nœuds par clé "productId:label"
  //    → les vrais doublons (même équipement, même label, plusieurs synoptiques)
  //      sont fusionnés en une seule ligne.
  //    → deux équipements DIFFÉRENTS avec le même label → deux lignes distinctes.
  const byKey = new Map<string, FlatNode[]>()
  for (const f of flat) {
    const lbl = (f.node.label ?? '').trim()
    if (!lbl) continue
    const key = `${f.node.productId ?? ''}:${lbl.toLowerCase()}`
    const arr = byKey.get(key) ?? []
    arr.push(f)
    byKey.set(key, arr)
  }

  // 2. Lignes existantes, auto seulement : par instance liée, et lignes sans
  //    lien vivant par label. Sans lien vivant = aucune de leurs instances n'est
  //    encore sur un synoptique (produit supprimé puis remis, copié puis
  //    original supprimé), ou lignes sans lien du tout (anciennes lignes,
  //    lignes orphelines). Plusieurs lignes peuvent partager un label.
  //    Une instance peut être liée à plusieurs lignes (ligne fusionnée et ligne
  //    orpheline qui garde son équipement) : on les garde toutes.
  const presentIds = new Set(flat.map((f) => f.node.id))
  const existingByInstanceId = new Map<string, IPTableRow[]>()
  const unlinkedByLabel = new Map<string, IPTableRow[]>()
  for (const row of existing) {
    if (row.manual) continue
    for (const iid of row.productInstanceIds) {
      const arr = existingByInstanceId.get(iid) ?? []
      arr.push(row)
      existingByInstanceId.set(iid, arr)
    }
    const lbl = row.label.trim().toLowerCase()
    if (lbl && !row.productInstanceIds.some((iid) => presentIds.has(iid))) {
      const arr = unlinkedByLabel.get(lbl) ?? []
      arr.push(row)
      unlinkedByLabel.set(lbl, arr)
    }
  }

  // 3. Conserver toutes les lignes manuelles intactes
  const manualRows = existing.filter((r) => r.manual)

  // 4. Pour chaque groupe (productId:label) → produire une ligne
  const autoRows: IPTableRow[] = []
  const consumedRowIds = new Set<string>()

  /** Ligne sans lien à reprendre pour ce groupe : d'abord celle du même produit
   *  (ligne orpheline), sinon une ancienne ligne dont le produit est inconnu. */
  const takeUnlinked = (label: string, productId: string | undefined): IPTableRow | undefined => {
    const candidates = (unlinkedByLabel.get(label.toLowerCase()) ?? []).filter((r) => !consumedRowIds.has(r.id))
    return candidates.find((r) => productId && r.productId === productId)
      ?? candidates.find((r) => !r.productId)
  }

  for (const [, group] of byKey.entries()) {
    const label = group[0].node.label!.trim()
    const productId = group[0].node.productId
    const instanceIds = group.map((g) => g.node.id)

    // Chercher une ligne existante déjà liée à un de ces IDs. Si plusieurs lignes
    // conviennent, prendre celle dont les instances correspondent le mieux au
    // groupe (part de ses instances qui sont dans le groupe), puis une ligne
    // non orpheline : deux équipements séparés retrouvent chacun leur ligne.
    const groupIds = new Set(instanceIds)
    const score = (r: IPTableRow) =>
      r.productInstanceIds.filter((iid) => groupIds.has(iid)).length / r.productInstanceIds.length
    let existingRow: IPTableRow | undefined
    for (const iid of instanceIds) {
      for (const candidate of existingByInstanceId.get(iid) ?? []) {
        if (consumedRowIds.has(candidate.id)) continue
        if (
          !existingRow
          || score(candidate) > score(existingRow)
          || (score(candidate) === score(existingRow) && existingRow.orphan && !candidate.orphan)
        ) existingRow = candidate
      }
    }
    // Sinon, reprendre une ligne sans lien (ancienne ou orpheline) de même label.
    // Une ligne déjà liée ne doit pas être récupérée par un autre produit.
    if (!existingRow) existingRow = takeUnlinked(label, productId)

    // Décrire le produit (premier du groupe — tous identiques en pratique)
    const productLabel = productLabelFor(group[0].node, group[0].product)

    if (existingRow) {
      consumedRowIds.add(existingRow.id)
      // Préserver les saisies manuelles, rafraîchir l'auto
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { orphan: _wasOrphan, ...kept } = existingRow
      autoRows.push({
        ...kept,
        product: productLabel,
        label,
        productId,
        productInstanceIds: instanceIds,
      })
    } else {
      autoRows.push({
        ...makeEmptyRow(false),
        product: productLabel,
        label,
        productId,
        productInstanceIds: instanceIds,
      })
    }
  }

  // 5. Lignes auto existantes non reprises (produit supprimé, label vidé, deux
  //    équipements fusionnés sous un même label…) : celles qui contiennent des
  //    saisies sont gardées et marquées orphelines, pour que rien ne se perde
  //    sans que l'utilisateur le décide. Elles gardent le lien vers leurs
  //    équipements encore présents, pour être reprises si le label change.
  //    Les lignes vides sont retirées.
  const orphanRows: IPTableRow[] = existing
    .filter((r) => !r.manual && !consumedRowIds.has(r.id) && rowHasUserData(r))
    .map((r) => ({
      ...r,
      productInstanceIds: r.productInstanceIds.filter((iid) => presentIds.has(iid)),
      orphan: true,
    }))

  return [...manualRows, ...autoRows, ...orphanRows]
}

/** Vrai si la ligne contient une saisie de l'utilisateur (hors colonnes calculées
 *  PRODUIT et LABEL). Une telle ligne ne doit jamais disparaître à la synchronisation. */
export function rowHasUserData(row: IPTableRow): boolean {
  const fields = [
    row.deviceId, row.ip, row.ipDante, row.ipDanteSec, row.login, row.password,
    row.serialNumber, row.mac, row.macDante,
  ]
  if (fields.some((v) => (v ?? '').trim() !== '')) return true
  return Object.values(row.customFields ?? {}).some((v) => (v ?? '').trim() !== '')
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

// ─────────────────────────────────────────────────────────────────────
// Formats IP et MAC (lot 4 de l'audit du 17/11/2026)
// ─────────────────────────────────────────────────────────────────────

/** Colonnes d'adresse IPv4 du Tableau IP. */
export type IPAddressColumn = 'ip' | 'ipDante' | 'ipDanteSec'
/** Colonnes d'adresse MAC du Tableau IP. */
export type MacColumn = 'mac' | 'macDante'
/** Colonnes contrôlées pour les doublons (IP et MAC). */
export type IPColumn = IPAddressColumn | MacColumn

export const IP_ADDRESS_COLUMNS: readonly IPAddressColumn[] = ['ip', 'ipDante', 'ipDanteSec']
export const MAC_COLUMNS: readonly MacColumn[] = ['mac', 'macDante']

/** Octets d'une IPv4 (quatre nombres de 0 à 255, zéros de tête admis), ou null. */
function ipv4Octets(value: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (!m) return null
  const octets = m.slice(1).map(Number)
  return octets.every((o) => o <= 255) ? octets : null
}

/** Vrai si la valeur est vide ou une IPv4 valide (espaces autour ignorés). */
export function isValidIPv4(value: string): boolean {
  const v = (value ?? '').trim()
  return v === '' || ipv4Octets(v) !== null
}

/** Forme comparable d'une IP : sans espaces ni zéros de tête
 *  (« 192.168.1.010 » donne « 192.168.1.10 »). Une valeur qui n'est pas une
 *  IPv4 est seulement débarrassée de ses espaces et mise en minuscules. */
export function normalizeIPv4(value: string): string {
  const v = (value ?? '').replace(/\s+/g, '')
  const octets = ipv4Octets(v)
  return octets ? octets.join('.') : v.toLowerCase()
}

const MAC_FORMATS = [
  /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i,
  /^[0-9a-f]{2}(-[0-9a-f]{2}){5}$/i,
  /^[0-9a-f]{4}(\.[0-9a-f]{4}){2}$/i,
  /^[0-9a-f]{12}$/i,
]

/** Vrai si la valeur est vide ou une MAC valide : six octets séparés par « : »
 *  ou « - », trois groupes de quatre séparés par « . », ou douze chiffres
 *  hexadécimaux sans séparateur. */
export function isValidMac(value: string): boolean {
  const v = (value ?? '').trim()
  return v === '' || MAC_FORMATS.some((re) => re.test(v))
}

/** Forme comparable d'une MAC : minuscules, sans séparateurs ni espaces. */
export function normalizeMac(value: string): string {
  return (value ?? '').replace(/[\s:.-]/g, '').toLowerCase()
}

/**
 * Détecte les doublons d'adresses : IP (colonnes IP / IP DANTE / IP DANTE SEC,
 * comparées normalisées) et MAC (colonnes MAC / MAC DANTE, comparées sans
 * casse ni séparateurs). Une IP n'est comparée qu'aux IP, une MAC qu'aux MAC.
 * Retourne une Map row.id → Set<colonne> des cellules en doublon.
 *
 * Fonction PURE : ne modifie jamais `rows`, ne déclenche aucun side-effect.
 */
export function detectIPDuplicates(
  rows: IPTableRow[],
): Map<string, Set<IPColumn>> {
  const dups = new Map<string, Set<IPColumn>>()
  const scan = (cols: readonly IPColumn[], norm: (v: string) => string) => {
    // Compter chaque valeur non vide à travers toutes les lignes et colonnes
    const counts = new Map<string, number>()
    for (const row of rows) {
      for (const col of cols) {
        const v = norm(row[col] ?? '')
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }
    // Marquer les cellules dont la valeur est en doublon
    for (const row of rows) {
      for (const col of cols) {
        const v = norm(row[col] ?? '')
        if (!v || (counts.get(v) ?? 0) < 2) continue
        const set = dups.get(row.id) ?? new Set<IPColumn>()
        set.add(col)
        dups.set(row.id, set)
      }
    }
  }
  scan(IP_ADDRESS_COLUMNS, normalizeIPv4)
  scan(MAC_COLUMNS, normalizeMac)
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

/** Garde uniquement les lignes en doublon (IP ou MAC). */
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
