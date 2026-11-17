import type { IPTableColumnConfig, IPTableRow } from '../types'
import { makeEmptyRow } from './ipTableSync'

/**
 * Import d'un fichier dans le Tableau IP (lot 4 de l'audit du 17/11/2026).
 *
 * Fonctions PURES : décodage des octets, lecture CSV / TSV, reconnaissance
 * des en-têtes, choix du tableau d'un .xls HTML, fusion par label et contrôle
 * du fichier proposé (bouton ou glisser-déposer). Aucune ne modifie ses entrées.
 */

/** Colonnes fixes que l'import sait remplir. */
export type ImportableField =
  | 'product' | 'label' | 'deviceId' | 'ip' | 'ipDante' | 'ipDanteSec'
  | 'login' | 'password' | 'serialNumber' | 'mac' | 'macDante'

/** Destination d'une colonne du fichier : colonne fixe ou colonne personnalisée. */
export type ImportTarget =
  | { kind: 'field'; key: ImportableField }
  | { kind: 'custom'; id: string }

/** Une ligne lue dans le fichier, valeurs déjà débarrassées de leurs espaces. */
export interface ImportedRow {
  values: Partial<Record<ImportableField, string>>
  customFields: Record<string, string>
}

// ── 1. Décodage ────────────────────────────────────────────────────────

/**
 * Décode les octets d'un fichier importé. BOM UTF-8 : UTF-8. Sinon UTF-8
 * strict, et en cas d'octet invalide, Windows-1252 (CSV enregistré par un
 * Excel français : « N° SERIE », accents, €).
 */
export function decodeImportBytes(
  bytes: Uint8Array,
): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }
  }
}

// ── 2. Lecture CSV / TSV ───────────────────────────────────────────────

/** Séparateur de la première ligne : le plus fréquent parmi « ; », tabulation
 *  et « , » (à égalité, dans cet ordre). Virgule par défaut. */
function detectSeparator(firstLine: string): string {
  let best = ','
  let bestCount = 0
  for (const sep of [';', '\t', ',']) {
    const count = firstLine.split(sep).length - 1
    if (count > bestCount) {
      best = sep
      bestCount = count
    }
  }
  return best
}

/** Lit un texte délimité (CSV ou TSV) en matrice de cellules. Gère les
 *  guillemets doublés et les retours à la ligne dans une cellule. */
export function parseDelimited(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const firstLineEnd = text.search(/\r|\n/)
  const sep = detectSeparator(firstLineEnd === -1 ? text : text.slice(0, firstLineEnd))

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const pushRow = () => {
    row.push(cell)
    cell = ''
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) pushRow()
  return rows
}

// ── En-têtes ───────────────────────────────────────────────────────────

/** Forme comparable d'un en-tête : sans accents, minuscules, espaces réduits. */
function normalizeHeader(h: string): string {
  return (h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** En-têtes connus (forme normalisée, sans accents) vers la colonne fixe. */
const HEADER_MAP: Record<string, ImportableField> = {
  produit: 'product',
  product: 'product',
  modele: 'product',
  reference: 'product',
  label: 'label',
  etiquette: 'label',
  id: 'deviceId',
  identifiant: 'deviceId',
  ip: 'ip',
  'adresse ip': 'ip',
  'ip dante': 'ipDante',
  'ip dante sec': 'ipDanteSec',
  'ip dante secondaire': 'ipDanteSec',
  login: 'login',
  utilisateur: 'login',
  "nom d'utilisateur": 'login',
  'mot de passe': 'password',
  password: 'password',
  motdepasse: 'password',
  'n° serie': 'serialNumber',
  'n°serie': 'serialNumber',
  'no serie': 'serialNumber',
  'numero serie': 'serialNumber',
  'numero de serie': 'serialNumber',
  serial: 'serialNumber',
  serialnumber: 'serialNumber',
  mac: 'mac',
  'adresse mac': 'mac',
  'mac dante': 'macDante',
}

/** Colonne visée par un en-tête : colonne fixe connue, sinon colonne
 *  personnalisée de même libellé (casse, accents et espaces ignorés). */
export function mapHeader(
  header: string,
  columns: IPTableColumnConfig[],
): ImportTarget | null {
  const n = normalizeHeader(header)
  if (!n) return null
  const key = HEADER_MAP[n]
  if (key) return { kind: 'field', key }
  const custom = columns.find((c) => c.custom && normalizeHeader(c.label) === n)
  return custom ? { kind: 'custom', id: custom.id } : null
}

/** Nombre de colonnes reconnues dans une ligne d'en-tête. */
function recognizedCount(header: string[], columns: IPTableColumnConfig[]): number {
  return header.filter((h) => mapHeader(h, columns) !== null).length
}

// ── 3. Choix du tableau d'un .xls HTML ─────────────────────────────────

/**
 * Indice du tableau de données parmi les tableaux d'un .xls HTML : celui dont
 * l'en-tête (première ligne) contient le plus de colonnes reconnues ; à
 * égalité, le plus long. -1 si aucun en-tête n'est reconnu (le cartouche
 * réseau d'un export SynoX, PLAGE IP / MASQUE…, n'en a aucun).
 */
export function pickDataTable(
  tables: string[][][],
  columns: IPTableColumnConfig[],
): number {
  let best = -1
  let bestScore = 0
  let bestRows = 0
  tables.forEach((t, i) => {
    const score = t.length > 0 ? recognizedCount(t[0], columns) : 0
    if (score > bestScore || (score === bestScore && score > 0 && t.length > bestRows)) {
      best = i
      bestScore = score
      bestRows = t.length
    }
  })
  return best
}

// ── Lecture des lignes ─────────────────────────────────────────────────

/**
 * Lit les lignes d'une matrice dont la première ligne est l'en-tête.
 * Lignes entièrement vides : sautées ; lignes sans valeur dans une colonne
 * reconnue : comptées dans `ignored`.
 */
export function readImportedRows(
  matrix: string[][],
  columns: IPTableColumnConfig[],
): { rows: ImportedRow[]; ignored: number; recognized: number } {
  if (matrix.length === 0) return { rows: [], ignored: 0, recognized: 0 }
  const targets = matrix[0].map((h) => mapHeader(h, columns))
  const rows: ImportedRow[] = []
  let ignored = 0
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i]
    if (cells.every((c) => (c ?? '').trim() === '')) continue
    const row: ImportedRow = { values: {}, customFields: {} }
    let hasContent = false
    targets.forEach((target, j) => {
      if (!target) return
      const v = (cells[j] ?? '').trim()
      if (!v) return
      hasContent = true
      if (target.kind === 'field') row.values[target.key] = v
      else row.customFields[target.id] = v
    })
    if (hasContent) rows.push(row)
    else ignored++
  }
  return { rows, ignored, recognized: targets.filter(Boolean).length }
}

// ── 4. Fusion par label ────────────────────────────────────────────────

export interface IPImportPlan {
  /** Lignes existantes à modifier (une entrée par ligne, champs changés seulement). */
  updates: { rowId: string; patch: Partial<IPTableRow> }[]
  /** Nouvelles lignes manuelles. */
  additions: IPTableRow[]
  /** Lignes existantes retrouvées par leur label mais déjà identiques. */
  unchanged: number
}

const labelKey = (label: string | undefined) => (label ?? '').trim().toLowerCase()

/**
 * Prépare l'import sans rien modifier. Avec `updateByLabel`, une ligne
 * importée dont le label (sans casse ni espaces autour) est celui d'une ligne
 * existante met à jour les champs NON VIDES de cette ligne, colonnes
 * personnalisées comprises ; le label existant n'est pas réécrit, ni le
 * produit d'une ligne liée aux synoptiques (il est recalculé à chaque
 * synchronisation). Les autres lignes sont ajoutées comme lignes manuelles.
 */
export function planIPImport(
  existing: IPTableRow[],
  imported: ImportedRow[],
  updateByLabel: boolean,
): IPImportPlan {
  const byLabel = new Map<string, IPTableRow>()
  if (updateByLabel) {
    for (const r of existing) {
      const k = labelKey(r.label)
      // Plusieurs lignes de même label : la première qui n'est pas orpheline.
      const current = byLabel.get(k)
      if (k && (!current || (current.orphan && !r.orphan))) byLabel.set(k, r)
    }
  }

  const patches = new Map<string, Partial<IPTableRow>>()
  const matched = new Set<string>()
  const additions: IPTableRow[] = []

  for (const imp of imported) {
    const target = updateByLabel ? byLabel.get(labelKey(imp.values.label)) : undefined
    if (!target) {
      const row: IPTableRow = { ...makeEmptyRow(true), ...imp.values }
      if (Object.keys(imp.customFields).length > 0) row.customFields = { ...imp.customFields }
      additions.push(row)
      continue
    }
    matched.add(target.id)
    const patch = { ...(patches.get(target.id) ?? {}) }
    for (const [key, value] of Object.entries(imp.values) as [ImportableField, string][]) {
      if (!value || key === 'label') continue
      if (key === 'product' && !target.manual) continue
      if (value !== target[key]) patch[key] = value
    }
    const baseCustom = patch.customFields ?? target.customFields ?? {}
    const changedCustom = Object.entries(imp.customFields).filter(([id, v]) => v && v !== baseCustom[id])
    if (changedCustom.length > 0) {
      patch.customFields = { ...baseCustom, ...Object.fromEntries(changedCustom) }
    }
    if (Object.keys(patch).length > 0) patches.set(target.id, patch)
  }

  const updates = [...patches.entries()].map(([rowId, patch]) => ({ rowId, patch }))
  return { updates, additions, unchanged: matched.size - updates.length }
}

// ── 5. Fichier proposé (bouton ou glisser-déposer) ─────────────────────

export type ImportFileCheck =
  | { ok: true; kind: 'csv' | 'xls' }
  | { ok: false; message: string }

const CSV_EXTENSIONS = ['.csv', '.tsv', '.txt']
const CSV_TYPES = ['text/csv', 'text/tab-separated-values', 'text/plain', 'application/csv']

/** Accepte ou refuse un fichier d'après son extension, à défaut son type. */
export function checkImportFile(file: { name: string; type: string }): ImportFileCheck {
  const name = (file.name ?? '').toLowerCase()
  const type = (file.type ?? '').toLowerCase().split(';')[0].trim()
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || type.includes('spreadsheetml')) {
    return {
      ok: false,
      message: 'Format XLSX non pris en charge. Réenregistrez le fichier en CSV depuis Excel (Fichier, Enregistrer sous, CSV).',
    }
  }
  if (CSV_EXTENSIONS.some((ext) => name.endsWith(ext))) return { ok: true, kind: 'csv' }
  if (name.endsWith('.xls')) return { ok: true, kind: 'xls' }
  if (!/\.[a-z0-9]+$/.test(name)) {
    if (CSV_TYPES.includes(type)) return { ok: true, kind: 'csv' }
    if (type === 'application/vnd.ms-excel') return { ok: true, kind: 'xls' }
  }
  return {
    ok: false,
    message: `Fichier « ${file.name} » non accepté. Formats acceptés : .csv, .tsv, .txt, .xls.`,
  }
}
