import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function notificationHandler(secret = 'server-only-test-token') {
  const source = fs.readFileSync('supabase/functions/notify-admin-new-user/index.ts', 'utf8')
    .replace(/^import .*\n/gm, '')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  let handler
  let sent = 0
  vm.runInNewContext(outputText, {
    serve: fn => { handler = fn },
    Deno: { env: { get: name => name === 'SUPABASE_SERVICE_ROLE_KEY' ? secret : 'test-value' } },
    Response, console: { log() {}, error() {} },
    fetch: async () => { sent++; return Response.json({ id: 'test-email' }) },
  })
  return { handle: request => handler(request), sent: () => sent }
}
const request = (token, method = 'POST') => new Request('https://example.test/notify', {
  method,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  ...(method === 'POST' ? { body: JSON.stringify({ record: { email: 'test@example.test', full_name: 'Test' } }) } : {}),
})
test('unauthenticated and ordinary user calls never send an email', async () => {
  const app = notificationHandler()
  for (const token of [undefined, 'ordinary-user-jwt', 'server-only-test-token-extra']) {
    assert.equal((await app.handle(request(token))).status, 401)
  }
  assert.equal(app.sent(), 0)
})
test('missing server credential fails closed', async () => {
  const app = notificationHandler('')
  assert.equal((await app.handle(request())).status, 503)
  assert.equal(app.sent(), 0)
})
test('authenticated database webhook sends one notification', async () => {
  const app = notificationHandler()
  assert.equal((await app.handle(request('server-only-test-token'))).status, 200)
  assert.equal(app.sent(), 1)
})
test('non-POST calls never send a notification', async () => {
  const app = notificationHandler()
  assert.equal((await app.handle(request('server-only-test-token', 'GET'))).status, 405)
  assert.equal(app.sent(), 0)
})
