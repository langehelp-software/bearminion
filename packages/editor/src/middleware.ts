import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { EditorContext } from './options.js'
import { API_PREFIX } from './options.js'
import { handleEditorRequest, type HandleMeta } from './api.js'
import { assetFile } from './asset-refs.js'
import { isLocalRequest, JSON_BODY_LIMIT, MULTIPART_BODY_LIMIT } from './security.js'

type Next = (error?: unknown) => void

/** Dev-only path that serves a file missing from Vite's eager asset glob. */
export const ASSETS_PREFIX = '/__bearminion/assets'

const ASSET_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

export interface EditorMiddlewareHooks {
  renderPreview?: HandleMeta['renderPreview']
  renderSitePreview?: HandleMeta['renderSitePreview']
}

/** Connect middleware. Requests outside the editor API are passed through. */
export function createEditorMiddleware(context: EditorContext, hooks: EditorMiddlewareHooks = {}) {
  return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
    const rawUrl = req.url ?? '/'
    const pathname = stripTrailingSlash(rawUrl.split('?')[0] ?? '/')
    if (pathname === ASSETS_PREFIX) {
      serveAsset(req, res, context, rawUrl)
      return
    }
    if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) {
      next()
      return
    }
    void dispatch(req, res, context, rawUrl, hooks).catch((error: unknown) => {
      if (res.headersSent || res.writableEnded) return
      const message = error instanceof Error ? error.message : 'Unexpected error.'
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'write_failed', message }))
    })
  }
}

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  context: EditorContext,
  rawUrl: string,
  hooks: EditorMiddlewareHooks,
): Promise<void> {
  const headers = headersFrom(req)
  const method = (req.method ?? 'GET').toUpperCase()
  const multipart = (headers.get('content-type') ?? '').toLowerCase().includes('multipart/form-data')
  const limit = multipart ? MULTIPART_BODY_LIMIT : JSON_BODY_LIMIT
  const advertised = Number(headers.get('content-length') ?? '')
  if (Number.isFinite(advertised) && advertised > limit) {
    await send(res, jsonProblem(413, 'too_large', multipart ? 'Upload exceeds the 5MB image limit.' : 'JSON body exceeds 1MB.'))
    return
  }

  let body: Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await readBody(req, limit)
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        await send(res, jsonProblem(413, 'too_large', multipart ? 'Upload exceeds the 5MB image limit.' : 'JSON body exceeds 1MB.'))
        return
      }
      throw error
    }
  }

  const host = headers.get('host') || 'localhost'
  let requestUrl: string
  try {
    requestUrl = new URL(rawUrl, `http://${host}`).toString()
  } catch {
    requestUrl = new URL(rawUrl, 'http://127.0.0.1').toString()
  }
  const request = new Request(requestUrl, {
    method,
    headers,
    body: body === undefined ? undefined : (body as unknown as BodyInit),
  })
  const response = await handleEditorRequest(request, context, {
    remoteAddress: req.socket?.remoteAddress ?? null,
    renderPreview: hooks.renderPreview,
    renderSitePreview: hooks.renderSitePreview,
  })
  await send(res, response ?? jsonProblem(404, 'not_found', 'Unknown editor API route.'))
}

function headersFrom(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const onData = (chunk: Buffer | string) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buffer.length
      if (size > limit) {
        cleanup()
        req.destroy()
        reject(new PayloadTooLargeError())
        return
      }
      chunks.push(buffer)
    }
    const onEnd = () => {
      cleanup()
      resolve(Buffer.concat(chunks))
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}

class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large')
    this.name = 'PayloadTooLargeError'
  }
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  res.end(bytes)
}

function jsonProblem(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function serveAsset(req: IncomingMessage, res: ServerResponse, context: EditorContext, rawUrl: string): void {
  const headers = headersFrom(req)
  if (!isLocalRequest(headers, req.socket?.remoteAddress ?? null)) {
    res.statusCode = 403
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('forbidden')
    return
  }
  const method = (req.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, HEAD')
    res.end('method')
    return
  }
  let src = ''
  try {
    src = new URL(rawUrl, 'http://127.0.0.1').searchParams.get('src') ?? ''
  } catch {
    src = ''
  }
  const absolute = assetFile(context.root, context.uploadsDir, src)
  const type = absolute ? ASSET_TYPES[path.extname(absolute).toLowerCase()] : undefined
  if (!absolute || !type) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('cache-control', 'no-store')
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    // Content points at a file that is gone. A visible placeholder says so on the page, where a broken-image icon would not.
    res.statusCode = 404
    res.setHeader('content-type', 'image/svg+xml')
    res.end(method === 'HEAD' ? undefined : missingImageSvg(src))
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', type)
  if (method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(absolute).pipe(res)
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Striped frame with "Missing image" and the file name. Scales to any box. */
export function missingImageSvg(src: string): string {
  const name = escapeXml(path.basename(src))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice">
<defs><pattern id="s" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#f4f1ec"/><rect width="5" height="12" fill="#ebe5dc"/></pattern></defs>
<rect width="480" height="300" fill="url(#s)"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle">
<text x="240" y="146" font-size="18" font-weight="600" fill="#b42318">Missing image</text>
<text x="240" y="172" font-size="13" fill="#6b6459">${name}</text>
</g>
</svg>`
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '')
  return pathname
}
