// Lot 3 de l'audit du 17/11/2026 : placement dans les baies.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { loadStore, loadSource } from './support/load-store.mjs'

const { placementProblem, findFreeSlot, rackResizeProblem, uLabel, uStartFromLabel, fitColumn, productRackSize } = await import(loadSource(path.resolve('src/lib/rackLayout.ts')))
const { useAppStore, useEditorState } = await loadStore()
const store = useAppStore

const item = (id, uStart, heightU = 1, extra = {}) => ({ id, sourceType: 'catalog', uStart, heightU, widthCols: 4, colStart: 0, ...extra })
const rack = (items = [], extra = {}) => ({ id: 'r', name: 'Baie', widthInch: 19, heightU: 12, numberingFromBottom: true, items, ...extra })

test('un équipement qui dépasse le haut de la baie est refusé', () => {
  assert.match(placementProblem(rack(), item('x', 12, 2)), /dépasse/)
  assert.equal(placementProblem(rack(), item('x', 11, 2)), null)
})

test('un équipement plus haut que la baie est refusé', () => {
  assert.match(placementProblem(rack(), item('x', 1, 13)), /dépasse|hauteur/)
})

test('une position ou une hauteur invalide est refusée', () => {
  assert.notEqual(placementProblem(rack(), item('x', 0, 1)), null)
  assert.notEqual(placementProblem(rack(), item('x', 1, 0)), null)
})

test('une largeur qui sort à droite est refusée', () => {
  assert.notEqual(placementProblem(rack(), item('x', 1, 1, { widthCols: 4, colStart: 3 })), null)
  assert.equal(placementProblem(rack(), item('x', 1, 1, { widthCols: 1, colStart: 3 })), null)
})

test('un chevauchement est refusé, sauf avec l’équipement lui-même', () => {
  const r = rack([item('a', 3, 2)])
  assert.match(placementProblem(r, item('x', 4, 1)), /occup/)
  assert.equal(placementProblem(r, item('a', 4, 2), 'a'), null)
  assert.equal(placementProblem(r, item('x', 4, 1, { widthCols: 1, colStart: 0 })) !== null, true)
})

test('un produit 19" est refusé dans une baie 10"', () => {
  assert.match(placementProblem(rack([], { widthInch: 10 }), item('x', 1), undefined, '19'), /19/)
  assert.equal(placementProblem(rack([], { widthInch: 10 }), item('x', 1), undefined, '10'), null)
})

test('la première place libre part du bas et respecte la hauteur', () => {
  const r = rack([item('a', 1, 2), item('b', 4, 1)])
  assert.deepEqual(findFreeSlot(r, 1, 4), { uStart: 3, colStart: 0 })
  assert.deepEqual(findFreeSlot(r, 2, 4), { uStart: 5, colStart: 0 })
  assert.equal(findFreeSlot(rack([item('a', 1, 12)]), 1, 4), null)
  assert.equal(findFreeSlot(rack(), 13, 4), null)
})

test('réduire une baie sous ses équipements est refusé', () => {
  const r = rack([item('a', 10, 2)])
  assert.match(rackResizeProblem(r, 10), /dépass/)
  assert.equal(rackResizeProblem(r, 11), null)
})

test('le numéro affiché dépend de la numérotation choisie', () => {
  assert.equal(uLabel(rack(), 1), 1)
  assert.equal(uLabel(rack([], { numberingFromBottom: false }), 1), 12)
  assert.equal(uLabel(rack([], { numberingFromBottom: false }), 12), 1)
})

// ── Store : la règle s'applique à toutes les voies ─────────────────────────
const bayTab = (items, extra = {}) => ({ id: 'baie', name: 'Baie', kind: 'bay', nodes: [], cables: [], zones: [], racks: [rack(items, extra)] })
const rackItems = () => store.getState().tabs.find(t => t.id === 'baie').racks[0].items
const theRack = () => store.getState().tabs.find(t => t.id === 'baie').racks[0]

beforeEach(() => {
  useEditorState.setState({ readOnly: false })
  store.getState().clearForUser(null)
  store.getState().clearForUser('compte-test')
  store.getState().loadProjectData('p', 'Projet', { tabs: [bayTab([item('a', 1, 2), item('lock', 5, 1, { locked: true })])], activeTabId: 'baie', projectMeta: {} })
})

test('le store refuse un ajout hors de la baie ou en chevauchement', () => {
  assert.equal(store.getState().addRackItem('baie', item(undefined, 12, 2), 'r'), '')
  assert.equal(store.getState().addRackItem('baie', item(undefined, 2, 1), 'r'), '')
  assert.notEqual(store.getState().addRackItem('baie', item(undefined, 3, 1), 'r'), '')
  assert.equal(rackItems().length, 3)
})

test('le store refuse une modification de position ou de taille invalide', () => {
  store.getState().updateRackItem('baie', 'a', { heightU: 20 })
  store.getState().updateRackItem('baie', 'a', { uStart: 5 })
  assert.deepEqual([rackItems()[0].uStart, rackItems()[0].heightU], [1, 2])
  store.getState().updateRackItem('baie', 'a', { label: 'Switch' })
  assert.equal(rackItems()[0].label, 'Switch')
})

test('un équipement verrouillé ne bouge pas et ne se supprime pas', () => {
  store.getState().updateRackItem('baie', 'lock', { uStart: 8 })
  store.getState().removeRackItem('baie', 'lock')
  assert.equal(rackItems().find(i => i.id === 'lock').uStart, 5)
  store.getState().updateRackItem('baie', 'lock', { label: 'Étiquette' })
  assert.equal(rackItems().find(i => i.id === 'lock').label, 'Étiquette')
  store.getState().updateRackItem('baie', 'lock', { locked: false })
  store.getState().removeRackItem('baie', 'lock')
  assert.equal(rackItems().some(i => i.id === 'lock'), false)
})

test('la baie se modifie (nom, hauteur, numérotation) sans couper ses équipements', () => {
  assert.equal(store.getState().updateRack('baie', 'r', { heightU: 4 }), false)
  assert.equal(theRack().heightU, 12)
  assert.equal(store.getState().updateRack('baie', 'r', { heightU: 6, name: 'Régie', numberingFromBottom: false }), true)
  assert.deepEqual([theRack().heightU, theRack().name, theRack().numberingFromBottom], [6, 'Régie', false])
})

test('la synchronisation ne fait pas déborder un équipement agrandi au catalogue', () => {
  store.getState().loadProjectData('p', 'Projet', {
    tabs: [
      { id: 'A', name: 'A', kind: 'synoptic', nodes: [{ id: 'n1', productId: 'p1', label: 'AMPLI', position: { x: 0, y: 0 } }], cables: [], zones: [] },
      bayTab([item('s', 1, 1, { sourceType: 'synoptic', nodeId: 'n1', productId: 'p1' }), item('b', 2, 1)]),
    ],
    activeTabId: 'baie', projectMeta: {}, products: [{ id: 'p1', manufacturer: 'M', reference: 'R', category: 'Ampli', rackHeightU: 3, inputs: [], outputs: [] }],
  })
  store.getState().syncBayItems('baie')
  const s = rackItems().find(i => i.id === 's')
  assert.equal(s.heightU, 1)
  assert.equal(s.label, 'AMPLI')
})

test('un numéro saisi dans la numérotation affichée redonne la position depuis le bas', () => {
  assert.equal(uStartFromLabel(rack(), 4), 4)
  assert.equal(uStartFromLabel(rack([], { numberingFromBottom: false }), 1), 12)
  assert.equal(uStartFromLabel(rack([], { numberingFromBottom: false }), uLabel(rack([], { numberingFromBottom: false }), 7)), 7)
})

test('élargir un équipement le recale à gauche pour rester dans la baie', () => {
  assert.equal(fitColumn(3, 2), 2)
  assert.equal(fitColumn(3, 4), 0)
  assert.equal(fitColumn(1, 1), 1)
})

test('le format d’un produit se lit par son identifiant', () => {
  assert.equal(productRackSize([{ id: 'p', rackSize: '19' }], 'p'), '19')
  assert.equal(productRackSize([{ id: 'p', rackSize: '19' }], undefined), undefined)
})

test('une baie qui contient un équipement verrouillé ne se supprime pas', () => {
  store.getState().addRackToTab('baie', { name: 'Seconde' })
  assert.equal(store.getState().removeRackFromTab('baie', 'r'), false)
  assert.equal(store.getState().tabs.find(t => t.id === 'baie').racks.length, 2)
  store.getState().updateRackItem('baie', 'lock', { locked: false })
  assert.equal(store.getState().removeRackFromTab('baie', 'r'), true)
})

test('la suppression d’un équipement dit si elle a eu lieu', () => {
  assert.equal(store.getState().removeRackItem('baie', 'lock'), false)
  assert.equal(store.getState().removeRackItem('baie', 'a'), true)
})
