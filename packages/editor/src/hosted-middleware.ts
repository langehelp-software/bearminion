import { AUTH_PREFIX } from './hosted-auth.js'
import type { HostedEditor, HostedScope } from './hosted-editor.js'
import type { ThemePreviewSource } from './preview.js'

/*
 * The hosted editor as request middleware for a server-rendered site (Astro's `onRequest`, or any framework with the same
 * shape). Web-standard APIs only; it imports nothing from the framework.
 */

/** What the site's pages find at `Astro.locals.bearminion` while someone is signed in. */
export type HostedLocals = HostedScope

export interface HostedMiddlewareOptions {
  /**
   * `required` (default): this deployment is the editor, so a visitor who is not signed in is sent to sign in, and
   * requests that are not page loads get 401. `optional`: visitors get the site as it is; only signed-in people get the
   * live content and the overlay.
   */
  signIn?: 'required' | 'optional'
  /** The theme's preview renderer, for the editor's live preview. See `HostedHandleOptions.preview`. */
  preview?: ThemePreviewSource
}

export interface HostedMiddlewareContext {
  request: Request
  locals: object
}

export type HostedMiddleware = (context: HostedMiddlewareContext, next: () => Promise<Response>) => Promise<Response>

function isPageLoad(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const fetchDest = request.headers.get('sec-fetch-dest')
  if (fetchDest) return fetchDest === 'document' || fetchDest === 'iframe'
  return (request.headers.get('accept') ?? '').includes('text/html')
}

function redirectToSignIn(request: Request): Response {
  const url = new URL(request.url)
  const returnTo = `${url.pathname}${url.search}`
  return new Response(null, {
    status: 302,
    headers: { location: `${AUTH_PREFIX}/login?returnTo=${encodeURIComponent(returnTo)}`, 'cache-control': 'no-store' },
  })
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/**
 * What a signed-in person sees when their page could not be drawn: the reason, in words, instead of a blank 500. Only
 * people with push access to the repository get here, so the message may name files and fields.
 */
function failedPage(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>This page could not be drawn</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:42rem;margin:12vh auto;padding:0 1.25rem;color:#1d1b18}pre{white-space:pre-wrap;background:#f4f1ec;padding:1rem;border-radius:.5rem;font-size:.875rem}</style></head><body><h1>This page could not be drawn</h1><p>The content in the repository does not render. Fix it in the editor, or in the repository, and reload.</p><pre>${escapeHtml(reason)}</pre></body></html>`
}

export function createHostedMiddleware(editor: HostedEditor, options: HostedMiddlewareOptions = {}): HostedMiddleware {
  const required = options.signIn !== 'optional'
  const handleOptions = options.preview ? { preview: options.preview } : {}

  return async ({ request, locals }, next) => {
    const handled = await editor.handle(request, handleOptions)
    if (handled) return handled

    const scope = await editor.scope(request)
    if (!scope) {
      if (!required) return next()
      if (isPageLoad(request)) return redirectToSignIn(request)
      return new Response('Sign in to continue.', {
        status: 401,
        headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    ;(locals as { bearminion?: HostedLocals }).bearminion = scope
    let response: Response
    try {
      response = await next()
    } catch (error) {
      if (!isPageLoad(request)) throw error
      // The overlay goes on the page that explains the failure too, so the person can still reach the editor.
      const page = new Response(failedPage(error), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      const withOverlay = await editor.inject(request, page)
      const headers = new Headers(withOverlay.headers)
      headers.set('cache-control', 'private, no-store')
      return new Response(withOverlay.body, { status: 500, headers })
    }
    return editor.inject(request, response)
  }
}
