/**
 * Utilitaires pour l'import/export CSV du catalogue produits.
 */

import type { Product } from '../types'
import type { UserProductMeta } from './userProductsApi'

// ── Export CSV ────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'reference', 'manufacturer', 'category',
  'articleCode', 'productUrl',
  'rackHeightU', 'rackSize', 'rackWidth',
  'widthCm', 'depthCm', 'heightCm',
  'weightKg',
  'powerStandbyW', 'powerOperatingW', 'thermalBtuH',
  'datasheetUrls',
  'nb_inputs', 'nb_outputs', 'nb_middle',
  'status',
]

const esc = (v: unknown) => {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function exportToCsv(
  products: Product[],
  productMeta: Record<string, UserProductMeta>,
  filename = 'catalogue-synox.csv',
) {
  const rows = [
    CSV_HEADERS.join(','),
    ...products.map(p => [
      esc(p.reference),
      esc(p.manufacturer),
      esc(p.category),
      esc(p.articleCode),
      esc(p.productUrl),
      esc(p.rackHeightU),
      esc(p.rackSize),
      esc(p.rackWidth),
      esc(p.widthCm),
      esc(p.depthCm),
      esc(p.heightCm),
      esc(p.weightKg),
      esc(p.powerStandbyW),
      esc(p.powerOperatingW),
      esc(p.thermalBtuH),
      esc((p.datasheetUrls ?? []).join('|')),
      esc(p.inputs.length),
      esc(p.outputs.length),
      esc((p.middle ?? []).length),
      esc(productMeta[p.id]?.status ?? ''),
    ].join(',')),
  ]

  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import CSV ────────────────────────────────────────────────────────────────

export interface CsvImportResult {
  products: Product[]
  errors: string[]
}

function parseRow(raw: string): string[] {
  const cells: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === '"') {
      let cell = ''
      i++ // skip opening quote
      while (i < raw.length) {
        if (raw[i] === '"' && raw[i + 1] === '"') { cell += '"'; i += 2 }
        else if (raw[i] === '"') { i++; break }
        else { cell += raw[i++] }
      }
      cells.push(cell)
      if (raw[i] === ',') i++
    } else {
      const end = raw.indexOf(',', i)
      if (end === -1) { cells.push(raw.slice(i)); break }
      cells.push(raw.slice(i, end))
      i = end + 1
    }
  }
  return cells
}

const toNum = (s: string) => {
  const n = parseFloat(s)
  return isNaN(n) ? undefined : n
}

export function importFromCsv(csvText: string): CsvImportResult {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { products: [], errors: ['Fichier vide ou invalide'] }

  const header = parseRow(lines[0]).map(h => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name.toLowerCase())

  const iRef = idx('reference')
  const iMan = idx('manufacturer')
  const iCat = idx('category')

  if (iRef === -1 || iMan === -1) {
    return { products: [], errors: ['Colonnes "reference" et "manufacturer" obligatoires'] }
  }

  const products: Product[] = []
  const errors: string[] = []

  lines.slice(1).forEach((line, rowIdx) => {
    const cells = parseRow(line)
    const get = (i: number) => (i === -1 ? '' : (cells[i] ?? '').trim())

    const reference = get(iRef)
    const manufacturer = get(iMan)
    if (!reference || !manufacturer) {
      errors.push(`Ligne ${rowIdx + 2} ignorée : référence ou marque manquante`)
      return
    }

    const product: Product = {
      id: `import-${Date.now()}-${rowIdx}`,
      reference,
      manufacturer,
      category: get(iCat),
      inputs: [],
      outputs: [],
      middle: [],
      articleCode:     get(idx('articleCode'))     || undefined,
      productUrl:      get(idx('productUrl'))      || undefined,
      datasheetUrls:   get(idx('datasheetUrls')).split('|').map(s => s.trim()).filter(Boolean) || undefined,
      rackHeightU:     toNum(get(idx('rackHeightU'))),
      rackSize:        (get(idx('rackSize')) || undefined) as Product['rackSize'],
      rackWidth:       (get(idx('rackWidth')) || undefined) as Product['rackWidth'],
      widthCm:         toNum(get(idx('widthCm'))),
      depthCm:         toNum(get(idx('depthCm'))),
      heightCm:        toNum(get(idx('heightCm'))),
      weightKg:        toNum(get(idx('weightKg'))),
      powerStandbyW:   toNum(get(idx('powerStandbyW'))),
      powerOperatingW: toNum(get(idx('powerOperatingW'))),
      thermalBtuH:     toNum(get(idx('thermalBtuH'))),
    }
    products.push(product)
  })

  return { products, errors }
}
