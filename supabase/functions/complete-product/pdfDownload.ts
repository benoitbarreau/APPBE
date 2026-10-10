export const MAX_PDF_BYTES = 15 * 1024 * 1024
const PDF_TIMEOUT_MS = 20_000

export class PdfDownloadError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Only the public datasheet bucket of this Supabase project is accepted. */
export function validatePdfUrl(value: unknown, supabaseUrl: string): string {
  let url: URL
  try {
    if (typeof value !== 'string' || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(value)) throw new Error()
    url = new URL(value)
    const origin = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password || url.search || url.hash) throw new Error()
    const prefix = '/storage/v1/object/public/product-datasheets/'
    if (!url.pathname.startsWith(prefix)) throw new Error()
    const segments = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent)
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\/\u0000-\u001f\u007f]/.test(segment))) throw new Error()
  } catch {
    throw new PdfDownloadError('Utilisez un PDF importé dans les fiches techniques SynoX.')
  }
  return url.href
}

/** Bound memory while reading, even without a Content-Length header. */
export async function downloadPdf(url: string, options: {
  fetcher?: typeof fetch; maxBytes?: number; timeoutMs?: number
} = {}): Promise<Uint8Array> {
  const { fetcher = fetch, maxBytes = MAX_PDF_BYTES, timeoutMs = PDF_TIMEOUT_MS } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetcher(url, { redirect: 'error', signal: controller.signal })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new PdfDownloadError('Impossible de télécharger la fiche technique.')
    }
    const length = Number(response.headers.get('Content-Length'))
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body.cancel()
      throw new PdfDownloadError('PDF trop volumineux (maximum 15 Mo).', 413)
    }
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        throw new PdfDownloadError('PDF trop volumineux (maximum 15 Mo).', 413)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
      throw new PdfDownloadError('Le fichier téléchargé n’est pas un PDF valide.')
    }
    return bytes
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error
    if (controller.signal.aborted) throw new PdfDownloadError('Le téléchargement du PDF a dépassé le délai de 20 secondes.', 504)
    throw new PdfDownloadError('Téléchargement PDF impossible : les redirections ne sont pas autorisées.')
  } finally {
    clearTimeout(timer)
    await reader?.cancel().catch(() => {})
    reader?.releaseLock()
  }
}
