import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

async function loadTs(path, replacements = []) {
  let source = fs.readFileSync(path, 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
}
const { syncIPRowsFromSynoptics, makeEmptyRow, dedupeRowsById } = await loadTs(
  'src/lib/ipTableSync.ts',
  [["import { isSynopticTab } from '../types'", "const isSynopticTab = t => t.kind !== 'iptable' && t.kind !== 'bay'"]],
)
const { buildSignature, createProjectExport } = await loadTs('src/lib/projectSerialization.ts')
const tab = nodes => ({ id: 'tab', name: 'Synoptique', kind: 'synoptic', nodes, cables: [], zones: [] })
const node = (id, productId, label = 'ECRAN1') => ({ id, productId, label, name: label, position: { x: 0, y: 0 } })

test('different products sharing a label keep unique rows and the original IP', () => {
  const existing = { ...makeEmptyRow(false), label: 'ECRAN1', productInstanceIds: ['n1'], ip: '192.168.1.10' }
  // The new group comes first: it must not steal the old row via its label.
  const tabs = [tab([node('n2', 'p2'), node('n1', 'p1')])]
  const rows = syncIPRowsFromSynoptics([existing], tabs, [])
  assert.equal(rows.length, 2)
  assert.equal(dedupeRowsById(rows).length, 2)
  assert.equal(rows.find(r => r.productInstanceIds.includes('n1')).ip, '192.168.1.10')
  assert.equal(rows.find(r => r.productInstanceIds.includes('n2')).ip, '')
  const again = syncIPRowsFromSynoptics(rows, tabs, [])
  assert.deepEqual(again, rows)
})

test('legacy label fallback is consumed once; manual entries remain untouched', () => {
  const legacy = { ...makeEmptyRow(false), label: 'ECRAN1', ip: '10.0.0.1' }
  const manual = { ...makeEmptyRow(true), label: 'ECRAN1', ip: '10.0.0.2' }
  const rows = syncIPRowsFromSynoptics([manual, legacy], [tab([node('n1', 'p1'), node('n2', 'p2')])], [])
  assert.equal(rows.length, 3)
  assert.equal(new Set(rows.map(r => r.id)).size, 3)
  assert.deepEqual(rows[0], manual)
  assert.equal(rows.filter(r => r.ip === '10.0.0.1').length, 1)
})

test('same equipment across synoptics remains merged and retains user data after a rename', () => {
  const existing = { ...makeEmptyRow(false), label: 'OLD', productInstanceIds: ['n1', 'n2'], password: 'example' }
  const rows = syncIPRowsFromSynoptics([existing], [tab([node('n1', 'p1', 'NEW'), node('n2', 'p1', 'NEW')])], [])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, existing.id)
  assert.equal(rows[0].password, 'example')
  assert.equal(rows[0].label, 'NEW')
})

const state = {
  currentProjectName: 'Salle A', activeTabId: 'tab',
  projectMeta: { campus: 'Campus', lieu: 'Paris', client: 'Client', bureauEtude: 'BE', trade: 'AV', authorName: 'Auteur', version: 'V1.0', date: '2026-10-08' },
  products: [], signals: { CUSTOM: { id: 'CUSTOM', label: 'Custom', color: '#123456', defaultCable: 'Cable', numberPrefix: 'C' } },
  zones: [{ id: 'z', label: 'Regie', color: '#abcdef' }],
  accessories: [{ id: 'acc', label: 'Custom' }], ipTableColumns: [{ id: 'custom_1', label: 'Inventaire', visible: true, custom: true }],
}
test('portable JSON preserves all project data without cloud identity or shares', () => {
  const tabs = [tab([]), { ...tab([]), id: 'rack', kind: 'bay', racks: [{ id: 'r', items: [] }] }]
  const output = JSON.parse(JSON.stringify(createProjectExport({ ...state, currentProjectId: 'cloud', shares: ['private'] }, tabs)))
  for (const key of ['projectMeta', 'products', 'signals', 'zones', 'accessories', 'ipTableColumns', 'activeTabId']) assert.deepEqual(output[key], state[key])
  assert.deepEqual(output.tabs, tabs)
  assert.equal(output.name, state.currentProjectName)
  assert.equal(output.currentProjectId, undefined)
  assert.equal(output.shares, undefined)
})

test('renaming triggers dirty detection without changing the content version hash', () => {
  const before = buildSignature([tab([])], state)
  const after = buildSignature([tab([])], { ...state, currentProjectName: 'Salle B' })
  assert.notEqual(after.full, before.full)
  assert.equal(after.base, before.base)
})
