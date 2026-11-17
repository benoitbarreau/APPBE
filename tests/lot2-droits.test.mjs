// Lot 2 de l'audit du 17/11/2026 : droits et confidentialité.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadStore, loadSource } from './support/load-store.mjs'
import path from 'node:path'

const { useAppStore, useEditorState } = await loadStore()
const { usedProducts, redactPasswords } = await import(loadSource(path.resolve('src/lib/projectSerialization.ts')))
const { IP_EXPORT_TEMPLATES, exportableColumns } = await import(loadSource(path.resolve('src/lib/ipExportTemplates.ts')))
const { describeSaveError } = await import(loadSource(path.resolve('src/lib/saveErrors.ts')))
const store = useAppStore

const synoptic = (id, extra = {}) => ({
  id, name: id, kind: 'synoptic', nodes: [], cables: [], zones: [],
  textNodes: [], shapeNodes: [], imageNodes: [], groups: [], ...extra,
})
const node = (id, productId = 'p1') => ({ id, productId, label: id.toUpperCase(), position: { x: 0, y: 0 } })

beforeEach(() => {
  useEditorState.setState({ readOnly: false })
  store.getState().clearForUser(null)
  store.getState().clearForUser('compte-test')
  store.getState().loadProjectData('p', 'Projet', { tabs: [synoptic('A', { nodes: [node('a1')] }), synoptic('B')], activeTabId: 'A', projectMeta: {} })
})

test('en lecture seule, les actions qui modifient le projet sont sans effet', () => {
  useEditorState.setState({ readOnly: true })
  const before = JSON.stringify(store.getState().tabs)
  store.getState().addTab()
  store.getState().renameTab('A', 'Renommé')
  store.getState().removeTab('B')
  store.getState().duplicateTab('A')
  store.getState().addIPTableTab('IP', false)
  store.getState().updateNode('a1', { label: 'X' })
  store.getState().removeNode('a1')
  store.getState().updateProjectMeta({ client: 'Autre client' })
  store.getState().upsertZone({ id: 'z', label: 'Zone', color: '#000' })
  store.getState().setProjectName('Autre nom')
  assert.equal(JSON.stringify(store.getState().tabs), before)
  assert.deepEqual(store.getState().nodes.map(n => n.label), ['A1'])
  assert.notEqual(store.getState().projectMeta.client, 'Autre client')
  assert.equal(store.getState().zones.some(z => z.id === 'z'), false)
  assert.equal(store.getState().currentProjectName, 'Projet')
})

test('en lecture seule, on peut encore naviguer, sélectionner et ouvrir un projet', () => {
  useEditorState.setState({ readOnly: true })
  store.getState().setActiveTab('B')
  assert.equal(store.getState().activeTabId, 'B')
  store.getState().setSelectedNode('a1')
  store.getState().loadProjectData('q', 'Autre', { tabs: [synoptic('C')], activeTabId: 'C', projectMeta: {} })
  assert.equal(store.getState().currentProjectId, 'q')
})

test('hors lecture seule, les modifications passent', () => {
  store.getState().renameTab('A', 'Renommé')
  assert.equal(store.getState().tabs.find(t => t.id === 'A').name, 'Renommé')
})

test('un projet n’embarque que les produits qu’il utilise', () => {
  const products = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'pending-autre-compte' }]
  const tabs = [
    synoptic('A', { nodes: [node('a1', 'p1')] }),
    { id: 'baie', name: 'Baie', kind: 'bay', nodes: [], cables: [], zones: [], racks: [{ id: 'r', items: [{ id: 'i', productId: 'p3', sourceType: 'catalog' }] }] },
    { id: 'legacy', name: 'Baie', kind: 'bay', nodes: [], cables: [], zones: [], bayItems: [{ id: 'j', productId: 'p2', sourceType: 'catalog' }] },
  ]
  assert.deepEqual(usedProducts(tabs, products).map(p => p.id).sort(), ['p1', 'p2', 'p3'])
})

test('les mots de passe sont retirés d’une copie du projet, sans toucher l’original', () => {
  const tabs = [{ id: 'ip', name: 'IP', kind: 'iptable', nodes: [], cables: [], zones: [], rows: [{ id: 'r', ip: '10.0.0.1', login: 'admin', password: 'secret' }] }]
  const out = redactPasswords(tabs)
  assert.equal(out[0].rows[0].password, '')
  assert.equal(out[0].rows[0].login, 'admin')
  assert.equal(tabs[0].rows[0].password, 'secret')
})

test('aucun modèle d’export ne contient les mots de passe', () => {
  for (const t of IP_EXPORT_TEMPLATES) assert.equal(t.columns.includes('password'), false, t.id)
})

test('la colonne mot de passe ne s’exporte que si elle est autorisée', () => {
  assert.deepEqual(exportableColumns(['ip', 'password'], { passwords: false }), ['ip'])
  assert.deepEqual(exportableColumns(['ip', 'password'], { passwords: true }), ['ip', 'password'])
})

test('une erreur de sauvegarde est expliquée selon sa cause', () => {
  assert.match(describeSaveError(Object.assign(new Error('denied'), { code: '42501' })), /droit/)
  assert.match(describeSaveError(Object.assign(new Error('x'), { code: 'P0002' })), /introuvable|supprimé/)
  assert.match(describeSaveError(new Error('Projet introuvable')), /introuvable|supprimé/)
  assert.match(describeSaveError(new TypeError('Failed to fetch')), /réseau|connexion/)
  assert.match(describeSaveError(new Error('autre')), /autre/)
})
