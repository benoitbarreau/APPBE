import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
let result
let request
const client = { rpc(name, args) { request = { name, args }; return { single: async () => result } } }
globalThis.__synoxSaveTestClient = client
const source = fs.readFileSync('src/lib/projectsApi.ts', 'utf8')
  .replace("import { supabase } from './supabase'", 'const supabase = globalThis.__synoxSaveTestClient')
  .replace("export { computeProjectHash } from './projectSerialization'", '')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { saveProjectAtomic, ProjectConflictError } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
delete globalThis.__synoxSaveTestClient
const data = { projectMeta: { version: 'V1.0' }, tabs: [] }
test('atomic save sends the timestamp associated with loaded data and returns server metadata', async () => {
  result = { data: { id: 'project', updated_at: 'new', versions_meta: [{ id: 'snapshot', version: 'V1.0', savedAt: 'now' }], version: 'V1.1' }, error: null }
  const saved = await saveProjectAtomic('project', 'Name', data, { expectedUpdatedAt: 'loaded', createVersion: true })
  assert.deepEqual(request, { name: 'save_project_atomic', args: { p_id: 'project', p_name: 'Name', p_data: data, p_expected_updated_at: 'loaded', p_create_version: true, p_force: false } })
  assert.equal(saved.version, 'V1.1')
  assert.equal(saved.updatedAt, 'new')
  assert.equal(saved.versionsMeta[0].id, 'snapshot')
})
test('conflict does not mutate the local project or hide the failure', async () => {
  const before = structuredClone(data)
  result = { data: null, error: { code: 'PT409', message: 'Conflict' } }
  await assert.rejects(saveProjectAtomic('project', 'Name', data, { expectedUpdatedAt: 'stale', createVersion: true }), ProjectConflictError)
  assert.deepEqual(data, before)
})
test('permission failures remain visible and force overwrite requires explicit opt-in', async () => {
  result = { data: null, error: { code: '42501', message: 'Denied' } }
  await assert.rejects(saveProjectAtomic('project', 'Name', data, { expectedUpdatedAt: null, createVersion: false, force: true }), /Denied/)
  assert.equal(request.args.p_force, true)
})
