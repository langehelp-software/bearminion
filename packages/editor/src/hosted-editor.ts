import type { CollectionOptions } from './collections.js'
import { type GithubStoreOptions, githubStore } from './github-store.js'
import { AUTH_PREFIX, type HostedAuth, type HostedAuthOptions, createHostedAuth } from './hosted-auth.js'
import { createHostedContext, handleHostedRequest } from './hosted.js'
import type { ContentModel } from './model.js'
import { API_PREFIX } from './model.js'
import type { PageRules } from './page.js'
import type { ImageConvertOptions } from './upload-rules.js'

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
  /** GitHub Enterprise: the web and API addresses. */
  githubUrl?: string
  apiUrl?: string
  fetch?: typeof fetch
  /** The clock, in milliseconds. For tests. */
  now?: () => number
}

export interface HostedEditor {
  /**
   * Answers `/__bearminion/auth/*` (sign-in) and `/__bearminion/api/*` (the editor API, signed-in people only).
   * Returns `null` for any other path, so the site's own routes carry on.
   */
  handle(request: Request): Promise<Response | null>
  auth: HostedAuth
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

  async function handle(request: Request): Promise<Response | null> {
    const signIn = await auth.handle(request)
    if (signIn) return signIn

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
    if (pathname !== API_PREFIX && !pathname.startsWith(`${API_PREFIX}/`)) return null

    const found = await auth.authenticate(request)
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
      store: githubStore({
        ...config.store,
        repo: config.repo,
        token: found.session.token,
        ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
        ...(config.fetch ? { fetch: config.fetch } : {}),
      }),
    })
    const response = await handleHostedRequest(request, context)
    if (response && found.cookie) response.headers.append('set-cookie', found.cookie)
    return response
  }

  return { handle, auth }
}
