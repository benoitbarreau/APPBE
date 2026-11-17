// Lot 1 de l'audit du 17/11/2026 : la synchronisation IP ne perd plus de saisies.
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
const { syncIPRowsFromSynoptics, makeEmptyRow } = await loadTs(
  'src/lib/ipTableSync.ts',
  [["import { isSynopticTab } from '../types'", "const isSynopticTab = t => t.kind !== 'iptable' && t.kind !== 'bay'"]],
)
const tab = (nodes, id = 'tab') => ({ id, name: id, kind: 'synoptic', nodes, cables: [], zones: [] })
const node = (id, productId, label) => ({ id, productId, label, name: label, position: { x: 0, y: 0 } })
const sync = (rows, nodes) => syncIPRowsFromSynoptics(rows, [tab(nodes)], [])
const withIp = (rows, ip) => rows.map(r => ({ ...r, ip }))

test('un produit supprimé puis remis retrouve son IP', () => {
  const rows = withIp(sync([], [node('n1', 'p1', 'DSP-01')]), '10.0.0.5')
  const after = sync(rows, [node('n2', 'p1', 'DSP-01')])
  assert.equal(after.length, 1)
  assert.equal(after[0].ip, '10.0.0.5')
  assert.deepEqual(after[0].productInstanceIds, ['n2'])
  assert.ok(!after[0].orphan)
})

test('une ligne remplie dont le produit a disparu reste, marquée orpheline', () => {
  const rows = withIp(sync([], [node('n1', 'p1', 'DSP-01')]), '10.0.0.5')
  const after = sync(rows, [])
  assert.equal(after.length, 1)
  assert.equal(after[0].ip, '10.0.0.5')
  assert.equal(after[0].orphan, true)
  assert.deepEqual(after[0].productInstanceIds, [])
  // Le produit revient plus tard : la ligne orpheline est reprise.
  const back = sync(after, [node('n9', 'p1', 'DSP-01')])
  assert.equal(back.length, 1)
  assert.equal(back[0].ip, '10.0.0.5')
  assert.ok(!back[0].orphan)
})

test('une ligne vide dont le produit a disparu est retirée', () => {
  const rows = sync([], [node('n1', 'p1', 'DSP-01')])
  assert.deepEqual(sync(rows, []), [])
})

test('une saisie dans une colonne personnalisée suffit à garder la ligne', () => {
  const rows = sync([], [node('n1', 'p1', 'DSP-01')]).map(r => ({ ...r, customFields: { custom_1: 'Baie 2' } }))
  const after = sync(rows, [])
  assert.equal(after.length, 1)
  assert.equal(after[0].orphan, true)
})

test('deux équipements renommés avec le même label gardent leurs deux IP', () => {
  let rows = sync([], [node('n1', 'p1', 'CAM1'), node('n2', 'p1', 'CAM2')])
  rows = rows.map(r => ({ ...r, ip: r.label === 'CAM1' ? '10.0.0.1' : '10.0.0.2' }))
  const after = sync(rows, [node('n1', 'p1', 'CAM1'), node('n2', 'p1', 'CAM1')])
  assert.deepEqual(after.map(r => r.ip).sort(), ['10.0.0.1', '10.0.0.2'])
  assert.equal(after.filter(r => r.orphan).length, 1)
})

test('une ancienne ligne reste reprise même si une ligne manuelle de même label la suit', () => {
  const legacy = { ...makeEmptyRow(false), label: 'ECRAN1', ip: '10.0.0.1' }
  const manual = { ...makeEmptyRow(true), label: 'ECRAN1', ip: '10.0.0.2' }
  const after = sync([legacy, manual], [node('n1', 'p1', 'ECRAN1')])
  const linked = after.find(r => r.productInstanceIds.includes('n1'))
  assert.equal(linked.ip, '10.0.0.1')
  assert.equal(after.length, 2)
})

test('deux anciennes lignes de même label sont reprises toutes les deux', () => {
  const a = { ...makeEmptyRow(false), label: 'ECRAN1', ip: '10.0.0.1' }
  const b = { ...makeEmptyRow(false), label: 'ECRAN1', ip: '10.0.0.2' }
  const after = sync([a, b], [node('n1', 'p1', 'ECRAN1'), node('n2', 'p2', 'ECRAN1')])
  assert.deepEqual(after.map(r => r.ip).sort(), ['10.0.0.1', '10.0.0.2'])
  assert.ok(after.every(r => r.productInstanceIds.length === 1))
})

test('une ligne orpheline revient au produit qu’elle décrivait, pas à un autre de même label', () => {
  const rows = withIp(sync([], [node('n2', 'p2', 'ECRAN1')]), '10.0.0.2')
  const orphaned = sync(rows, [])
  const after = sync(orphaned, [node('n1', 'p1', 'ECRAN1'), node('n3', 'p2', 'ECRAN1')])
  assert.equal(after.find(r => r.productInstanceIds.includes('n3')).ip, '10.0.0.2')
  assert.equal(after.find(r => r.productInstanceIds.includes('n1')).ip, '')
})
