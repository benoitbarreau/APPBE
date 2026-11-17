// Lot 4 de l'audit du 17/11/2026 : exports (cartouche commun, cellules sûres, baie, Tableau IP).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { loadSource } from './support/load-store.mjs'

const { buildCartouche } = await import(loadSource(path.resolve('src/lib/cartouche.ts')))
const { safeCsvCell, composedImageType } = await import(loadSource(path.resolve('src/lib/exportCells.ts')))
const { exportCellValue, NET_LABELS } = await import(loadSource(path.resolve('src/lib/ipExportValues.ts')))
const { buildBayRows, ipLinksByNode } = await import(loadSource(path.resolve('src/lib/bayRows.ts')))

const meta = { client: 'Client', lieu: 'Paris', campus: '', bureauEtude: '', trade: '', authorName: 'Auteur', version: 'V1.2', date: 'lundi 17 novembre 2026' }

test('le cartouche exporté reprend le campus saisi avant le nom du projet', () => {
  const c = buildCartouche({ ...meta, campus: 'Campus Nord' }, 'Projet', { name: 'Synoptique 1' })
  assert.equal(c.campus, 'Campus Nord')
  assert.equal(buildCartouche(meta, 'Projet', { name: 'Synoptique 1' }).campus, 'Projet')
  assert.equal(buildCartouche(meta, '', { name: 'S' }).campus, 'Sans titre')
})

test('le lot exporté est celui saisi pour l’onglet, sinon son nom (baie comprise)', () => {
  assert.equal(buildCartouche(meta, 'P', { name: 'Baie 1', trade: 'Lot courant faible' }).tabName, 'Lot courant faible')
  assert.equal(buildCartouche(meta, 'P', { name: 'Baie 1' }).tabName, 'Baie 1')
})

test('le bureau d’étude saisi part dans le cartouche, et la date n’est jamais vide', () => {
  assert.equal(buildCartouche({ ...meta, bureauEtude: 'BE Vidéo Synergie' }, 'P', { name: 'S' }).bureauEtude, 'BE Vidéo Synergie')
  assert.notEqual(buildCartouche({ ...meta, date: '' }, 'P', { name: 'S' }).date, '')
})

test('une cellule CSV qui ressemble à une formule est neutralisée', () => {
  assert.equal(safeCsvCell('=HYPERLINK("x")'), "'=HYPERLINK(\"x\")")
  assert.equal(safeCsvCell('+33 1 69 59 26 26'), "'+33 1 69 59 26 26")
  assert.equal(safeCsvCell('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(safeCsvCell('192.168.1.10'), '192.168.1.10')
  assert.equal(safeCsvCell(''), '')
})

test('un export JPEG est bien composé en JPEG', () => {
  assert.equal(composedImageType('jpeg'), 'image/jpeg')
  assert.equal(composedImageType('png'), 'image/png')
  assert.equal(composedImageType(undefined), 'image/png')
})

test('le masque du cartouche réseau est exporté sous son nom', () => {
  assert.equal(NET_LABELS.find(f => f.key === 'dhcp').label, 'MASQUE')
})

test('une ligne orpheline est signalée dans les exports du Tableau IP', () => {
  assert.equal(exportCellValue({ label: 'DSP-01', orphan: true }, 'label'), 'DSP-01 (orpheline)')
  assert.equal(exportCellValue({ label: 'DSP-01' }, 'label'), 'DSP-01')
  assert.equal(exportCellValue({ customFields: { custom_1: 'Baie 2' } }, 'custom_1'), 'Baie 2')
})

test('les exports de baie reprennent l’IP et le n° de série du Tableau IP', () => {
  const tabs = [{ id: 'ip', kind: 'iptable', nodes: [], cables: [], zones: [], rows: [{ id: 'r', productInstanceIds: ['n1'], ip: '10.0.0.5', serialNumber: 'SN42' }] }]
  const rack = { id: 'r', name: 'Baie', widthInch: 19, heightU: 12, numberingFromBottom: true, items: [
    { id: 'a', sourceType: 'synoptic', nodeId: 'n1', uStart: 1, heightU: 1, widthCols: 4, colStart: 0, annotations: { ip: 'ancienne' } },
    { id: 'b', sourceType: 'catalog', uStart: 2, heightU: 1, widthCols: 4, colStart: 0, annotations: { ip: '10.0.0.9', serial: 'X' } },
  ] }
  const rows = buildBayRows([rack], ipLinksByNode(tabs))
  const a = rows.find(r => r.posU === 'U1')
  const b = rows.find(r => r.posU === 'U2')
  assert.deepEqual([a.ip, a.serial], ['10.0.0.5', 'SN42'])
  assert.deepEqual([b.ip, b.serial], ['10.0.0.9', 'X'])
})

test('le style texte des cellules XLS est celui qu’Excel attend', async () => {
  const { XLS_TEXT_CELL } = await import(loadSource(path.resolve('src/lib/exportCells.ts')))
  assert.equal(XLS_TEXT_CELL, 'mso-number-format:"' + String.fromCharCode(92) + '@";')
})
