import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = fs.readFileSync('supabase/functions/complete-product/pdfDownload.ts', 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { validatePdfUrl, downloadPdf, PdfDownloadError } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))
const origin = 'https://project.supabase.co'
const url = `${origin}/storage/v1/object/public/product-datasheets/user/file.pdf`
const pdf = new TextEncoder().encode('%PDF-1.7\nexample')
test('public datasheet URL remains compatible with uploaded filenames', () => {
  assert.equal(validatePdfUrl(url, origin), url)
  assert.equal(validatePdfUrl(url.replace('file.pdf', 'Fiche%20technique.pdf'), origin).includes('%20'), true)
})
test('foreign origins, credentials, other buckets and encoded traversal are refused', () => {
  for (const value of [undefined, 'http://127.0.0.1/x', url.replace('project.supabase.co', 'project.supabase.co.evil.test'), url.replace('https://', 'https://user@'), url.replace('product-datasheets', 'other'), url + '?download=1', url + '#fragment', url.replace('file.pdf', '%2Ffile.pdf'), url.replace('file.pdf', '%5Cfile.pdf'), url.replace('file.pdf', '%00file.pdf'), url.replace('file.pdf', '%2e%2e/private')]) {
    assert.throws(() => validatePdfUrl(value, origin), PdfDownloadError)
  }
})
test('valid PDF is read with redirects disabled and an abort signal', async () => {
  const result = await downloadPdf(url, { fetcher: async (_, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal)
    return new Response(pdf)
  } })
  assert.deepEqual(result, pdf)
})
test('oversized Content-Length cancels the body before any read', async () => {
  let cancelled = false
  const body = new ReadableStream({ cancel() { cancelled = true } })
  await assert.rejects(downloadPdf(url, { maxBytes: 10, fetcher: async () => new Response(body, { headers: { 'Content-Length': '100' } }) }), e => e.status === 413)
  assert.equal(cancelled, true)
})
test('stream exceeding limit is cancelled even with a false Content-Length', async () => {
  let cancelled = false
  const body = new ReadableStream({ start(c) { c.enqueue(pdf); c.enqueue(new Uint8Array(20)) }, cancel() { cancelled = true } })
  await assert.rejects(downloadPdf(url, { maxBytes: 20, fetcher: async () => new Response(body, { headers: { 'Content-Length': '1' } }) }), e => e.status === 413)
  assert.equal(cancelled, true)
})
test('non-PDF content and HTTP failures are refused', async () => {
  for (const response of [new Response('<html>'), new Response('missing', { status: 404 })]) {
    await assert.rejects(downloadPdf(url, { fetcher: async () => response }), PdfDownloadError)
  }
})
test('timeout aborts pending fetch, and redirects are never retried', async () => {
  await assert.rejects(downloadPdf(url, { timeoutMs: 5, fetcher: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), e => e.status === 504)
  let calls = 0
  await assert.rejects(downloadPdf(url, { fetcher: async () => { calls++; throw new TypeError('redirect') } }), PdfDownloadError)
  assert.equal(calls, 1)
})
function handler(status, auth = true) {
  const src = fs.readFileSync('supabase/functions/complete-product/index.ts', 'utf8').replace(/^import .*\n/gm, '')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  let handle; let downloads = 0
  vm.runInNewContext(js, {
    serve: fn => { handle = fn }, Response, console: { error() {} }, AbortSignal,
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? origin : 'test-secret' } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: auth ? { id: 'user' } : null }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: status === 'error' ? null : { status }, error: status === 'error' ? {} : null }) }) }) }) }),
    validatePdfUrl, PdfDownloadError,
    downloadPdf: async () => { downloads++; throw new PdfDownloadError('stopped') },
  })
  return { handle, downloads: () => downloads }
}
const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ pdfUrl: url }) })
test('pending, rejected, missing profiles and invalid auth never download or call AI', async () => {
  for (const status of ['pending', 'rejected', 'error']) {
    const app = handler(status)
    assert.equal((await app.handle(request())).status, 403)
    assert.equal(app.downloads(), 0)
  }
  const app = handler('approved', false)
  assert.equal((await app.handle(request())).status, 401)
  assert.equal(app.downloads(), 0)
})
test('approved account reaches the bounded downloader', async () => {
  const app = handler('approved')
  assert.equal((await app.handle(request())).status, 400)
  assert.equal(app.downloads(), 1)
})
test('deadline also covers the body after headers have arrived', async () => {
  await assert.rejects(downloadPdf(url, { timeoutMs: 5, fetcher: async (_, { signal }) => {
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener('abort', () => controller.error(new Error('aborted body')))
    } }))
  } }), e => e.status === 504)
})
