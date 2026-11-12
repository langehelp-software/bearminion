import { isAssetPath } from './asset-paths.js'
import { missingImageSvg } from './missing-image.js'
import type { ContentStore } from './store-core.js'
import { StoreError } from './store-error.js'

/*
 * `GET /__bearminion/assets?src=src/assets/...` for the hosted editor: an image straight from the repository, so the
 * editor and the pages it draws show a file the moment it is committed, before the site has been built again. The
 * caller has already checked that someone is signed in. Pure: no Node imports.
 */

export const ASSETS_ROUTE = '/__bearminion/assets'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  'cache-control': 'private, max-age=300',
  'x-content-type-options': 'nosniff',
  ...extra,
})

export async function serveStoreAsset(request: Request, store: ContentStore): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const src = new URL(request.url).searchParams.get('src') ?? ''
  const type = TYPES[src.slice(src.lastIndexOf('.') + 1).toLowerCase()]
  if (!isAssetPath(src) || !type) return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  if (!store.readAsset) return new Response('This store does not serve images.', { status: 501, headers: { 'cache-control': 'no-store' } })

  let asset: Awaited<ReturnType<NonNullable<ContentStore['readAsset']>>>
  try {
    const ifNoneMatch = request.headers.get('if-none-match')
    asset = await store.readAsset(src, ifNoneMatch ? { ifNoneMatch } : {})
  } catch (error) {
    if (error instanceof StoreError) {
      return new Response(JSON.stringify({ error: error.code, message: error.message }), {
        status: error.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    throw error
  }
  if (!asset) {
    // The content points at a file that is gone. A visible placeholder says so on the page, where a broken-image icon would not.
    return new Response(method === 'HEAD' ? null : missingImageSvg(src), {
      status: 404,
      headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    })
  }
  if ('notModified' in asset) return new Response(null, { status: 304, headers: headers({ etag: asset.etag }) })
  return new Response(method === 'HEAD' ? null : (asset.bytes as BodyInit), {
    status: 200,
    headers: headers({
      'content-type': type,
      'content-length': String(asset.bytes.byteLength),
      ...(asset.etag ? { etag: asset.etag } : {}),
    }),
  })
}
