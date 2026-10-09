import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}
const modules = new Map()
function loadSource(file) {
  if (modules.has(file)) return modules.get(file)
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  const code = outputText.replace(/(from\s+|import\s*)["']([^"']+)["']/g, (_, prefix, specifier) => {
    let resolved
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier)
      resolved = loadSource(['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync))
    } else resolved = import.meta.resolve(specifier)
    return `${prefix}${JSON.stringify(resolved)}`
  })
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(file, url)
  return url
}
const { useAppStore, useCatalogMeta, useEditorState } = await import(loadSource(path.resolve('src/store.ts')))

test('switching users removes private data, migration buffers and undo history', () => {
  const store = useAppStore
  store.getState().clearForUser('account-a')
  store.getState().mergeUserZones([{ id: 'private-zone', label: 'Private', color: '#000' }])
  store.getState().mergeUserSignals({ PRIVATE: { label: 'Private signal', color: '#000' } })
  store.setState({
    nodes: [{ id: 'private-node' }], imageNodes: [{ id: 'private-image' }], groups: [{ id: 'private-group' }],
    productMeta: { private: { userId: 'account-a' } }, archivedProducts: [{ id: 'private-product' }],
    archivedProductsMeta: { private: {} }, accessories: [{ id: 'private-accessory' }],
    ipTableColumns: [{ key: 'private-column' }], currentProjectId: 'private-project',
  })
  useCatalogMeta.setState({ catalogBrands: [{ id: 'private-brand' }] })
  useEditorState.setState({ readOnly: true, cableView: 'simple', cableLabelsHidden: false })
  assert.ok(store.temporal.getState().pastStates.length > 0)
  store.getState().clearForUser('account-b')
  const state = store.getState()
  for (const key of ['nodes', 'imageNodes', 'groups', 'archivedProducts']) assert.deepEqual(state[key], [])
  assert.deepEqual(state.productMeta, {})
  assert.deepEqual(state.archivedProductsMeta, {})
  assert.equal(state.currentProjectId, null)
  assert.equal(state.lastUserId, 'account-b')
  assert.equal(state.accessories.some(x => x.id === 'private-accessory'), false)
  assert.equal(state.ipTableColumns.some(x => x.key === 'private-column'), false)
  assert.deepEqual(useCatalogMeta.getState().catalogBrands, [])
  assert.equal(useEditorState.getState().readOnly, false)
  assert.deepEqual(store.temporal.getState().pastStates, [])
  assert.deepEqual(store.temporal.getState().futureStates, [])
  store.temporal.getState().undo()
  assert.deepEqual(store.getState().nodes, [])
  store.getState().loadProjectData('legacy', 'Legacy', { tabs: [{ id: 'tab', name: 'Tab', nodes: [], cables: [] }], projectMeta: {} }, [])
  assert.equal(store.getState().zones.some(x => x.id === 'private-zone'), false)
  assert.equal('PRIVATE' in store.getState().signals, false)
  assert.equal(storage.get('av-diagram-generator').includes('private-image'), false)
})

test('same-account refresh preserves unsaved work; logout clears it', () => {
  useAppStore.setState({ nodes: [{ id: 'unsaved' }] })
  useAppStore.getState().clearForUser('account-b')
  assert.equal(useAppStore.getState().nodes[0].id, 'unsaved')
  useAppStore.getState().clearForUser(null)
  assert.deepEqual(useAppStore.getState().nodes, [])
  assert.equal(useAppStore.getState().lastUserId, null)
  assert.deepEqual(useAppStore.temporal.getState().pastStates, [])
})
