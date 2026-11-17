// Lot 1 de l'audit du 17/11/2026 : état de travail des onglets, zones et historique.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadStore } from './support/load-store.mjs'

const { useAppStore, getFlushedTabs, getProjectEpoch } = await loadStore()
const store = useAppStore
const history = () => store.temporal.getState()

const synoptic = (id, extra = {}) => ({
  id, name: id, kind: 'synoptic', nodes: [], cables: [], zones: [],
  textNodes: [], shapeNodes: [], imageNodes: [], groups: [], ...extra,
})
const node = (id) => ({ id, productId: 'blank', position: { x: 0, y: 0 } })
const project = (tabs, extra = {}) => ({
  tabs, activeTabId: tabs[0].id, projectMeta: {}, zones: [{ id: 'z-salle', label: 'Salle', color: '#123456' }], ...extra,
})

beforeEach(() => {
  store.getState().clearForUser(null)
  store.getState().clearForUser('compte-test')
})

test('la sauvegarde emporte les images et les groupes de l’onglet actif', () => {
  store.getState().loadProjectData('p1', 'Projet', project([synoptic('A')]))
  store.setState({
    nodes: [node('n1'), node('n2')],
    imageNodes: [{ id: 'logo', position: { x: 0, y: 0 }, src: 'data:image/png;base64,AA' }],
    groups: [{ id: 'g1', nodeIds: ['n1', 'n2'] }],
  })
  const active = getFlushedTabs().find(t => t.id === 'A')
  assert.deepEqual(active.imageNodes.map(i => i.id), ['logo'])
  assert.deepEqual(active.groups.map(g => g.id), ['g1'])
})

test('changer d’onglet recharge les groupes de l’onglet cible', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [node('a1'), node('a2')], groups: [{ id: 'gA', nodeIds: ['a1', 'a2'] }] }),
    synoptic('B', { nodes: [node('b1'), node('b2')], groups: [{ id: 'gB', nodeIds: ['b1', 'b2'] }] }),
  ]))
  assert.deepEqual(store.getState().groups.map(g => g.id), ['gA'])
  store.getState().setActiveTab('B')
  assert.deepEqual(store.getState().groups.map(g => g.id), ['gB'])
  store.getState().setActiveTab('A')
  assert.deepEqual(store.getState().groups.map(g => g.id), ['gA'])
  const tabB = store.getState().tabs.find(t => t.id === 'B')
  assert.deepEqual(tabB.groups.map(g => g.id), ['gB'])
})

test('ouvrir un projet ne garde pas les groupes du projet précédent', () => {
  store.getState().loadProjectData('p1', 'Projet 1', project([synoptic('A', { nodes: [node('a1'), node('a2')] })]))
  store.getState().groupNodes(['a1', 'a2'])
  store.getState().loadProjectData('p2', 'Projet 2', project([synoptic('C', { nodes: [node('c1')] })]))
  assert.deepEqual(store.getState().groups, [])
  store.getState().resetProject()
  assert.deepEqual(store.getState().groups, [])
})

test('créer un tableau IP conserve les zones du projet', () => {
  store.getState().loadProjectData('p1', 'Projet', project([synoptic('A')]))
  store.getState().addIPTableTab('Tableau IP', false)
  assert.deepEqual(store.getState().zones.map(z => z.id), ['z-salle'])
})

test('dupliquer une baie conserve les zones du projet', () => {
  store.getState().loadProjectData('p1', 'Projet', project([synoptic('A')]))
  const bayId = store.getState().addBayTab({ name: 'Baie 1' })
  store.getState().duplicateTab(bayId)
  assert.deepEqual(store.getState().zones.map(z => z.id), ['z-salle'])
})

test('dupliquer un synoptique copie ses groupes avec les nouveaux identifiants', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [node('a1'), node('a2')], groups: [{ id: 'gA', nodeIds: ['a1', 'a2'] }] }),
  ]))
  store.getState().duplicateTab('A')
  const { nodes, groups } = store.getState()
  assert.equal(groups.length, 1)
  assert.notEqual(groups[0].id, 'gA')
  assert.deepEqual([...groups[0].nodeIds].sort(), nodes.map(n => n.id).sort())
})

test('annuler après un changement d’onglet ne colle pas l’autre canevas', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [node('a1')] }),
    synoptic('B', { nodes: [node('b1')] }),
  ]))
  store.setState({ nodes: [node('a1'), node('a2')] })
  store.getState().setActiveTab('B')
  history().undo()
  assert.deepEqual(store.getState().nodes.map(n => n.id), ['b1'])
  assert.deepEqual(history().pastStates, [])
})

test('annuler après l’ouverture d’un projet ne ramène pas le projet précédent', () => {
  store.getState().loadProjectData('p1', 'Projet 1', project([synoptic('A', { nodes: [node('a1')] })]))
  store.setState({ nodes: [node('a1'), node('a2')] })
  store.getState().loadProjectData('p2', 'Projet 2', project([synoptic('C', { nodes: [node('c1')] })]))
  assert.deepEqual(history().pastStates, [])
  history().undo()
  assert.deepEqual(store.getState().nodes.map(n => n.id), ['c1'])
})

test('annuler après la suppression de l’onglet actif ne verse pas son contenu ailleurs', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [node('a1')] }),
    synoptic('B', { nodes: [node('b1')] }),
  ]))
  store.setState({ nodes: [node('a1'), node('a2')] })
  store.getState().removeTab('A')
  history().undo()
  assert.deepEqual(store.getState().nodes.map(n => n.id), ['b1'])
})

test('une modification hors canevas ne crée pas d’entrée d’annulation', () => {
  store.getState().loadProjectData('p1', 'Projet', project([synoptic('A', { nodes: [node('a1')] })]))
  const before = history().pastStates.length
  store.getState().updateProjectMeta({ client: 'Client' })
  store.setState({ selectedNodeId: 'a1' })
  assert.equal(history().pastStates.length, before)
  store.setState({ nodes: [node('a1'), node('a2')] })
  assert.equal(history().pastStates.length, before + 1)
})

test('l’époque du projet change à chaque ouverture, nouveau projet ou changement de compte', () => {
  const e0 = getProjectEpoch()
  store.getState().loadProjectData('p1', 'Projet', project([synoptic('A')]))
  const e1 = getProjectEpoch()
  assert.notEqual(e1, e0)
  store.getState().resetProject()
  const e2 = getProjectEpoch()
  assert.notEqual(e2, e1)
  store.getState().clearForUser('autre-compte')
  assert.notEqual(getProjectEpoch(), e2)
})

test('coller un produit dans le même onglet lui donne un nouveau label', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [{ ...node('a1'), label: 'DSP-01', labelIsAuto: true }] }),
    synoptic('B', { nodes: [{ ...node('b1'), label: 'DSP-02', labelIsAuto: true }] }),
  ]))
  const copied = store.getState().nodes[0]
  store.getState().pasteNodes({ nodes: [copied], textNodes: [], shapeNodes: [], imageNodes: [], offsetX: 20, offsetY: 20 })
  const labels = store.getState().nodes.map(n => n.label)
  assert.deepEqual(labels, ['DSP-01', 'DSP-03'])
})

test('coller un produit dans un autre onglet garde son label s’il y est libre', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', { nodes: [{ ...node('a1'), label: 'DSP-01', labelIsAuto: true }] }),
    synoptic('B'),
  ]))
  const copied = store.getState().nodes[0]
  store.getState().setActiveTab('B')
  store.getState().pasteNodes({ nodes: [copied], textNodes: [], shapeNodes: [], imageNodes: [], offsetX: 0, offsetY: 0 })
  assert.deepEqual(store.getState().nodes.map(n => n.label), ['DSP-01'])
})

test('dupliquer un synoptique relie les câbles des formes à leurs copies', () => {
  store.getState().loadProjectData('p1', 'Projet', project([
    synoptic('A', {
      nodes: [node('a1')],
      shapeNodes: [{ id: 's1', position: { x: 0, y: 0 } }],
      cables: [{ id: 'c1', fromNodeId: 'a1', fromPortId: 'o', toNodeId: 's1', toPortId: 'i', signal: 'HDMI' }],
    }),
  ]))
  store.getState().duplicateTab('A')
  const { cables, shapeNodes, nodes } = store.getState()
  assert.equal(cables[0].fromNodeId, nodes[0].id)
  assert.equal(cables[0].toNodeId, shapeNodes[0].id)
  assert.notEqual(shapeNodes[0].id, 's1')
})
