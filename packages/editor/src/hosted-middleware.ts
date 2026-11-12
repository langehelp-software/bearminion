import { AUTH_PREFIX } from './hosted-auth.js'
import type { HostedEditor, HostedScope } from './hosted-editor.js'

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

export function createHostedMiddleware(editor: HostedEditor, options: HostedMiddlewareOptions = {}): HostedMiddleware {
  const required = options.signIn !== 'optional'

  return async ({ request, locals }, next) => {
    const handled = await editor.handle(request)
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
    return editor.inject(request, await next())
  }
}
