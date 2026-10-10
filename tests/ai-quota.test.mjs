import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { reserveQuota, releaseQuota, AiQuotaError } = await import('data:text/javascript;base64,' + Buffer.from(transpile(fs.readFileSync('supabase/functions/complete-product/quota.ts', 'utf8'))).toString('base64'))
test('quota denial and database failure fail closed', async () => {
  for (const [data, error, status] of [[{ allowed: false, reason: 'daily', limit: 50 }, null, 429], [{ allowed: false, reason: 'concurrent' }, null, 429], [null, {}, 503], [{}, null, 503]]) {
    await assert.rejects(reserveQuota({ rpc: async () => ({ data, error }) }, 'user'), e => e.status === status)
  }
})
test('reservation and release target the authenticated user and exact lease', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { allowed: true, leaseId: 'lease' }, error: null } } }
  const lease = await reserveQuota(client, 'user')
  await releaseQuota(client, 'user', lease)
  assert.deepEqual(calls, [{ name: 'reserve_ai_completion', args: { p_user_id: 'user' } }, { name: 'release_ai_completion', args: { p_user_id: 'user', p_lease_id: 'lease' } }])
})
function handler(denied = false, downloadFails = false) {
  let handle; const calls = { downloads: 0, ai: 0, releases: 0 }
  const source = fs.readFileSync('supabase/functions/complete-product/index.ts', 'utf8').replace(/^import .*\n/gm, '')
  vm.runInNewContext(transpile(source), {
    serve: fn => { handle = fn }, Response, AbortSignal, console: { error() {} },
    Deno: { env: { get: () => 'test' } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'approved' } }) }) }) }) }),
    validatePdfUrl: () => 'safe-url', PdfDownloadError: class extends Error {}, AiQuotaError,
    reserveQuota: async (_, id) => { assert.equal(id, 'caller'); if (denied) throw new AiQuotaError('Quota dépassé', 429); return 'lease' },
    releaseQuota: async (_, id, lease) => { assert.equal(id, 'caller'); assert.equal(lease, 'lease'); calls.releases++ },
    downloadPdf: async () => { calls.downloads++; if (downloadFails) throw new Error('download failed'); return new Uint8Array() },
    encodeBase64: () => '', fetch: async () => { calls.ai++; return Response.json({ candidates: [{ content: { parts: [{ text: '{"notes":"test"}' }] } }] }) },
  })
  return { handle, calls }
}
const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: JSON.stringify({ pdfUrl: 'test' }) })
test('denied requests do not download PDF or call Gemini', async () => {
  const app = handler(true)
  assert.equal((await app.handle(request())).status, 429)
  assert.deepEqual(app.calls, { downloads: 0, ai: 0, releases: 0 })
})
test('reserved slots are released after success and download failure', async () => {
  for (const fails of [false, true]) {
    const app = handler(false, fails)
    assert.equal((await app.handle(request())).status, fails ? 400 : 200)
    assert.equal(app.calls.releases, 1)
    assert.equal(app.calls.ai, fails ? 0 : 1)
  }
})
