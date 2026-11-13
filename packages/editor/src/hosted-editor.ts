import type { CollectionOptions } from './collections.js'
import { type GithubStoreOptions, githubStore } from './github-store.js'
import { ASSETS_ROUTE, serveStoreAsset } from './asset-route.js'
import { AUTH_PREFIX, type HostedAuth, type HostedAuthOptions, createHostedAuth } from './hosted-auth.js'
import { createHostedContext, handleHostedRequest } from './hosted-context.js'
import type { ContentModel } from './model.js'
import { API_PREFIX } from './model.js'
import type { PageRules } from './page.js'
import { type ThemePreviewSource, previewRenderers } from './preview.js'
import { type StoreContent, createStoreContent } from './store-content.js'
import type { ContentStore } from './store-core.js'
import type { ImageConvertOptions } from './upload-rules.js'

/** Where the signed-in editor loads the overlay from. */
export const EDITOR_SCRIPT_PATH = '/__bearminion/editor.js'

/*
 * The hosted editor's request handler: sign-in in front of the editor API, with each request running on the signed-in
 * person's own GitHub token. Web-standard APIs only.
 */

export interface HostedEditorConfig extends ContentModel {
  /** `owner/name`. People with push access to it may sign in. */
  repo: string
  /** The GitHub App the sign-in uses. `repo` is filled in from the top level. */
  auth: Omit<HostedAuthOptions, 'repo' | 'fetch' | 'now' | 'githubUrl' | 'apiUrl'>
  /** Branch, folders, mode (`direct` or `pr`), commit messages. The token and repo come from sign-in and `repo`. */
  store?: Omit<GithubStoreOptions, 'repo' | 'token' | 'fetch' | 'apiUrl'>
  collections?: Record<string, CollectionOptions>
  pages?: Partial<PageRules>
  maxImageBytes?: number
  imageConvert?: false | ImageConvertOptions
  /**
   * The editor overlay as a browser script: `overlaySource` from `bearminion/hosted-overlay`. Served at
   * `/__bearminion/editor.js` to signed-in people only, and added to the site's pages by `inject`.
   */
  overlay?: string
  /** GitHub Enterprise: the web and API addresses. */
  githubUrl?: string
  apiUrl?: string
  fetch?: typeof fetch
  /** The clock, in milliseconds. For tests. */
  now?: () => number
}

export interface HostedHandleOptions {
  /**
   * The theme's preview renderer (the default export of `src/lib/render-preview.ts`), or a function that loads it.
   * With it the editor redraws a draft as it changes: a section just added, a layout switched, the header and footer.
   * Without it the preview endpoints answer 501 and such changes show after Save and a reload.
   * `bearminionHostedEditor` passes it by itself.
   */
  preview?: ThemePreviewSource
}

export interface HostedEditor {
  /**
   * Answers `/__bearminion/auth/*` (sign-in) and `/__bearminion/api/*` (the editor API, signed-in people only).
   * Returns `null` for any other path, so the site's own routes carry on.
   */
  handle(request: Request, options?: HostedHandleOptions): Promise<Response | null>
  /**
   * Passes a page the site rendered through, adding the editor overlay when the request comes from a signed-in
   * person. Anyone else gets the page untouched. A page with the overlay is marked `private, no-store`, so no cache
   * can hand it to a visitor. Needs `overlay`.
   */
  inject(request: Request, response: Response): Promise<Response>
  /**
   * The signed-in person's view of the repository for this request: their store and the site's pages read from it.
   * `null` when nobody is signed in. Costs one sign-in check per request, however often it is called.
   */
  scope(request: Request): Promise<HostedScope | null>
  auth: HostedAuth
}

export interface HostedScope {
  /** GitHub login of the signed-in person. */
  login: string
  /** The repository as this person sees it: reads and writes use their GitHub token. */
  store: ContentStore
  /** `site.json` and pages from `store`, checked the way the build checks them. */
  content: StoreContent
}

function unauthenticated(): Response {
  return new Response(JSON.stringify({ error: 'unauthenticated', message: 'Sign in to edit.', login: `${AUTH_PREFIX}/login` }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}

export function createHostedEditor(config: HostedEditorConfig): HostedEditor {
  const auth = createHostedAuth({
    ...config.auth,
    repo: config.repo,
    ...(config.githubUrl ? { githubUrl: config.githubUrl } : {}),
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
    ...(config.now ? { now: config.now } : {}),
  })

  // GitHub refresh tokens work once. A second check of the same request must not renew the token again.
  const checked = new WeakMap<Request, ReturnType<HostedAuth['authenticate']>>()
  function authenticate(request: Request): ReturnType<HostedAuth['authenticate']> {
    let found = checked.get(request)
    if (!found) {
      found = auth.authenticate(request)
      checked.set(request, found)
    }
    return found
  }

  function storeFor(token: string): ContentStore {
    return githubStore({
      ...config.store,
      repo: config.repo,
      token,
      ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
      ...(config.fetch ? { fetch: config.fetch } : {}),
    })
  }

  async function scope(request: Request): Promise<HostedScope | null> {
    const found = await authenticate(request)
    if (!found) return null
    const store = storeFor(found.session.token)
    return { login: found.session.login, store, content: createStoreContent(config, store) }
  }

  // One set of renderers per preview source, so a lazily loaded module is loaded once per server instance.
  const renderers = new WeakMap<object, ReturnType<typeof previewRenderers>>()
  function renderersFor(source: ThemePreviewSource): ReturnType<typeof previewRenderers> {
    let found = renderers.get(source)
    if (!found) {
      found = previewRenderers(source)
      renderers.set(source, found)
    }
    return found
  }

  async function handle(request: Request, options: HostedHandleOptions = {}): Promise<Response | null> {
    const signIn = await auth.handle(request)
    if (signIn) return signIn

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
    if (pathname === EDITOR_SCRIPT_PATH) {
      if (config.overlay === undefined) return null
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } })
      const signedIn = await authenticate(request)
      if (!signedIn) return unauthenticated()
      const script = new Response(config.overlay, {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'private, no-cache',
          'x-content-type-options': 'nosniff',
        },
      })
      if (signedIn.cookie) script.headers.append('set-cookie', signedIn.cookie)
      return script
    }
    if (pathname === ASSETS_ROUTE) {
      // Images straight from the repository: the editor's previews, and pages that use a file the build does not hold yet.
      const signedIn = await authenticate(request)
      if (!signedIn) return unauthenticated()
      const image = await serveStoreAsset(request, storeFor(signedIn.session.token))
      if (signedIn.cookie) image.headers.append('set-cookie', signedIn.cookie)
      return image
    }
    if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) return null

    const found = await authenticate(request)
    if (!found) return unauthenticated()

    const context = createHostedContext({
      sections: config.sections,
      site: config.site,
      ...(config.theme ? { theme: config.theme } : {}),
      ...(config.collections ? { collections: config.collections } : {}),
      ...(config.pages ? { pages: config.pages } : {}),
      ...(config.maxImageBytes === undefined ? {} : { maxImageBytes: config.maxImageBytes }),
      ...(config.imageConvert === undefined ? {} : { imageConvert: config.imageConvert }),
      ...(config.migrations ? { migrations: config.migrations } : {}),
      ...(config.schemaVersion === undefined ? {} : { schemaVersion: config.schemaVersion }),
      store: storeFor(found.session.token),
    })
    const response = await handleHostedRequest(request, context, options.preview ? renderersFor(options.preview) : {})
    if (response && found.cookie) response.headers.append('set-cookie', found.cookie)
    return response
  }

  const tag = `<script type="module" src="${EDITOR_SCRIPT_PATH}"></script>`

  async function inject(request: Request, response: Response): Promise<Response> {
    if (config.overlay === undefined || request.method !== 'GET' || response.status !== 200) return response
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) return response
    const signedIn = await authenticate(request)
    if (!signedIn) return response
    const html = await response.text()
    if (html.includes(EDITOR_SCRIPT_PATH)) return new Response(html, response)
    const close = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i)
    const body = close === -1 ? html + tag : html.slice(0, close) + tag + html.slice(close)
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('etag')
    headers.set('cache-control', 'private, no-store')
    headers.append('vary', 'Cookie')
    if (signedIn.cookie) headers.append('set-cookie', signedIn.cookie)
    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }

  return { handle, inject, scope, auth }
}
