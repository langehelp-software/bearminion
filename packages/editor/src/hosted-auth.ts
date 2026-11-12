import { isSameOriginRequest } from './request-guards.js'

/*
 * Sign-in for the hosted editor: GitHub App user authorization (OAuth with PKCE), then an encrypted session cookie.
 *
 * Who may edit is decided by GitHub: a person signs in with their own GitHub account and must have push access to the
 * repository. The session carries that person's own token, so commits are authored by them and the repository's rules
 * (branch protection, required reviews) apply to them as they would anywhere else. Web-standard APIs only (fetch,
 * Web Crypto): no Node imports, so it runs in a Worker.
 */

export const AUTH_PREFIX = '/__bearminion/auth'

export interface HostedSession {
  /** GitHub login of the signed-in person. */
  login: string
  /** GitHub user id. */
  id: number
  /** The person's GitHub token, used for every store call. Never leaves the encrypted cookie and the server. */
  token: string
  /** When the token expires, in milliseconds since the epoch. */
  expiresAt: number
  refreshToken?: string
  refreshExpiresAt?: number
  /** When the person signed in. The session ends `sessionDays` later, whatever the refresh token allows. */
  issuedAt: number
}

export interface HostedAuthOptions {
  /** The GitHub App's client id. */
  clientId: string
  /** The GitHub App's client secret. Keep it in the environment. */
  clientSecret: string
  /** At least 32 characters of randomness. Encrypts the cookies. Changing it signs everyone out. */
  secret: string
  /** `owner/name`. Only people with push access to this repository may sign in. */
  repo: string
  /**
   * The public origin of the editor, `https://admin.example.com`. Default: the origin of the request, which is wrong
   * behind a proxy that rewrites the scheme or host, so set it there. The GitHub App's callback URL must be
   * `<origin>/__bearminion/auth/callback`.
   */
  origin?: string
  /** A session ends this many days after sign-in. Default 7. */
  sessionDays?: number
  /** GitHub's web address, for GitHub Enterprise. Default `https://github.com`. */
  githubUrl?: string
  /** GitHub's API address. Default `https://api.github.com`. */
  apiUrl?: string
  fetch?: typeof fetch
  /** The clock, in milliseconds. For tests. */
  now?: () => number
}

export interface HostedAuth {
  /** Answers `/__bearminion/auth/*`. Returns `null` for any other path. */
  handle(request: Request): Promise<Response | null>
  /**
   * The signed-in person for a request, or `null`. `cookie` is a `Set-Cookie` value to send back when the token was
   * renewed on the way.
   */
  authenticate(request: Request): Promise<{ session: HostedSession; cookie?: string } | null>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const STATE_MINUTES = 10
const REFRESH_MARGIN_MS = 60_000

function toBase64Url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function randomToken(size: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)))
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode(`bearminion-hosted-auth:${secret}`))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Encrypts and authenticates `value`. `purpose` is bound in, so a login-state cookie can never pass as a session. */
async function seal(key: CryptoKey, purpose: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = encoder.encode(JSON.stringify(value))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) }, key, data))
  const out = new Uint8Array(iv.length + sealed.length)
  out.set(iv)
  out.set(sealed, iv.length)
  return toBase64Url(out)
}

async function open(key: CryptoKey, purpose: string, text: string | undefined): Promise<unknown> {
  if (!text) return null
  try {
    const bytes = fromBase64Url(text)
    if (bytes.length < 13) return null
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(purpose) },
      key,
      bytes.slice(12),
    )
    return JSON.parse(decoder.decode(plain))
  } catch {
    return null
  }
}

function readCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0) cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim())
  }
  return cookies
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Only a path on this site: no other origin, no protocol-relative `//host`, no backslash tricks. */
function safeReturnTo(value: string | null): string {
  if (value === null || !/^\/(?![/\\])[^\s\\]*$/.test(value)) return '/'
  return value
}

interface TokenReply {
  access_token: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
}

function page(status: number, title: string, message: string, extra?: Record<string, string>): Response {
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="font:16px system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  })
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  })
}

export function createHostedAuth(options: HostedAuthOptions): HostedAuth {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repo)) {
    throw new Error(`createHostedAuth(): repo must be "owner/name", got "${options.repo}".`)
  }
  if (!options.clientId || !options.clientSecret) throw new Error('createHostedAuth(): clientId and clientSecret are required.')
  if (typeof options.secret !== 'string' || options.secret.length < 32) {
    throw new Error('createHostedAuth(): secret must be at least 32 characters. Generate one with `openssl rand -base64 32`.')
  }
  const githubUrl = (options.githubUrl ?? 'https://github.com').replace(/\/+$/, '')
  const apiUrl = (options.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '')
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init))
  const now = options.now ?? Date.now
  const sessionMs = (options.sessionDays ?? 7) * 86_400_000
  const keyPromise = deriveKey(options.secret)

  const originOf = (request: Request): string => (options.origin ?? new URL(request.url).origin).replace(/\/+$/, '')
  const secure = (request: Request): boolean => originOf(request).startsWith('https://')
  const names = (request: Request) =>
    secure(request) ? { session: '__Host-bm-session', state: '__Host-bm-state' } : { session: 'bm-session', state: 'bm-state' }

  function cookie(request: Request, name: string, value: string, maxAgeSeconds: number): string {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure(request) ? '; Secure' : ''}`
  }

  async function tokenRequest(body: Record<string, string>): Promise<TokenReply | null> {
    try {
      const response = await doFetch(`${githubUrl}/login/oauth/access_token`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'bearminion' },
        body: JSON.stringify({ client_id: options.clientId, client_secret: options.clientSecret, ...body }),
      })
      const reply = (await response.json()) as Partial<TokenReply> & { error?: string }
      if (!response.ok || reply.error || typeof reply.access_token !== 'string') return null
      return reply as TokenReply
    } catch {
      return null
    }
  }

  async function githubGet(token: string, route: string): Promise<Response | null> {
    try {
      return await doFetch(`${apiUrl}${route}`, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28',
          'user-agent': 'bearminion',
        },
      })
    } catch {
      return null
    }
  }

  async function hasPushAccess(token: string): Promise<boolean> {
    const response = await githubGet(token, `/repos/${options.repo}`)
    if (!response?.ok) return false
    const repo = (await response.json()) as { permissions?: { push?: boolean } }
    return repo.permissions?.push === true
  }

  function sessionFrom(reply: TokenReply, who: { login: string; id: number }, issuedAt: number): HostedSession {
    const at = now()
    return {
      login: who.login,
      id: who.id,
      token: reply.access_token,
      expiresAt: at + (reply.expires_in ?? 8 * 3600) * 1000,
      ...(reply.refresh_token ? { refreshToken: reply.refresh_token } : {}),
      ...(reply.refresh_token ? { refreshExpiresAt: at + (reply.refresh_token_expires_in ?? 180 * 86_400) * 1000 } : {}),
      issuedAt,
    }
  }

  async function sessionCookie(request: Request, session: HostedSession): Promise<string> {
    const maxAge = Math.max(1, Math.floor((session.issuedAt + sessionMs - now()) / 1000))
    return cookie(request, names(request).session, await seal(await keyPromise, 'session', session), maxAge)
  }

  // GitHub accepts a refresh token once, and a page load asks for the page, the overlay and the API at the same moment.
  // Requests that find the same token about to expire share one renewal instead of racing for it.
  const renewing = new Map<string, Promise<{ session: HostedSession; cookie: string } | 'denied' | null>>()

  async function renew(request: Request, stored: HostedSession, refreshToken: string) {
    const reply = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
    // No answer: GitHub refused the token (another server may have used it a moment ago) or could not be reached.
    if (!reply) return null
    if (!(await hasPushAccess(reply.access_token))) return 'denied' as const
    const session = sessionFrom(reply, stored, stored.issuedAt)
    return { session, cookie: await sessionCookie(request, session) }
  }

  async function authenticate(request: Request): Promise<{ session: HostedSession; cookie?: string } | null> {
    const key = await keyPromise
    const stored = (await open(
      key,
      'session',
      readCookies(request.headers.get('cookie')).get(names(request).session),
    )) as HostedSession | null
    if (!stored || typeof stored.token !== 'string' || typeof stored.login !== 'string') return null
    const at = now()
    if (at >= stored.issuedAt + sessionMs) return null
    if (at < stored.expiresAt - REFRESH_MARGIN_MS) return { session: stored }
    // The token is about to expire: renew it, and check again that the person may still write to the repository.
    if (!stored.refreshToken || !stored.refreshExpiresAt || at >= stored.refreshExpiresAt) return null
    let pending = renewing.get(stored.refreshToken)
    if (!pending) {
      const token = stored.refreshToken
      pending = renew(request, stored, token).catch(() => null)
      renewing.set(token, pending)
      void pending.finally(() => renewing.delete(token))
    }
    const renewed = await pending
    if (renewed === 'denied') return null
    if (renewed) return renewed
    // Not renewed. The token still works until it expires, so a request that lost the race to renew it carries on with
    // it; the request that won sets the new cookie. After that moment the person has to sign in again.
    return at < stored.expiresAt ? { session: stored } : null
  }

  async function login(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const state = randomToken(16)
    const verifier = randomToken(32)
    const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
    const sealed = await seal(await keyPromise, 'state', { state, verifier, returnTo, expires: now() + STATE_MINUTES * 60_000 })
    const authorize = new URL(`${githubUrl}/login/oauth/authorize`)
    authorize.searchParams.set('client_id', options.clientId)
    authorize.searchParams.set('redirect_uri', `${originOf(request)}${AUTH_PREFIX}/callback`)
    authorize.searchParams.set('state', state)
    authorize.searchParams.set('code_challenge', challenge)
    authorize.searchParams.set('code_challenge_method', 'S256')
    return new Response(null, {
      status: 302,
      headers: {
        location: authorize.href,
        'cache-control': 'no-store',
        'set-cookie': cookie(request, names(request).state, sealed, STATE_MINUTES * 60),
      },
    })
  }

  async function callback(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const clearState = cookie(request, names(request).state, '', 0)
    const saved = (await open(await keyPromise, 'state', readCookies(request.headers.get('cookie')).get(names(request).state))) as {
      state: string
      verifier: string
      returnTo: string
      expires: number
    } | null
    const code = url.searchParams.get('code')
    if (!saved || saved.expires < now() || !code || url.searchParams.get('state') !== saved.state) {
      return page(400, 'Sign-in could not be completed', 'The sign-in link expired or was not started here. Start again.', {
        'set-cookie': clearState,
      })
    }
    const reply = await tokenRequest({
      code,
      redirect_uri: `${originOf(request)}${AUTH_PREFIX}/callback`,
      code_verifier: saved.verifier,
    })
    if (!reply) return page(502, 'Sign-in failed', 'GitHub did not accept the sign-in. Start again.', { 'set-cookie': clearState })
    const userReply = await githubGet(reply.access_token, '/user')
    if (!userReply?.ok) return page(502, 'Sign-in failed', 'GitHub did not say who you are. Start again.', { 'set-cookie': clearState })
    const who = (await userReply.json()) as { login?: unknown; id?: unknown }
    if (typeof who.login !== 'string' || typeof who.id !== 'number') {
      return page(502, 'Sign-in failed', 'GitHub sent an unexpected answer. Start again.', { 'set-cookie': clearState })
    }
    if (!(await hasPushAccess(reply.access_token))) {
      return page(
        403,
        'No access',
        `${who.login} cannot write to ${options.repo}. Ask the owner for write access, and check that the GitHub App is installed on the repository.`,
        {
          'set-cookie': clearState,
        },
      )
    }
    const headers = new Headers({ location: saved.returnTo, 'cache-control': 'no-store' })
    headers.append('set-cookie', clearState)
    headers.append('set-cookie', await sessionCookie(request, sessionFrom(reply, { login: who.login, id: who.id }, now())))
    return new Response(null, { status: 302, headers })
  }

  async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    const pathname = url.pathname.replace(/\/+$/, '')
    if (pathname !== AUTH_PREFIX && !pathname.startsWith(`${AUTH_PREFIX}/`)) return null
    const method = request.method.toUpperCase()
    const route = pathname.slice(AUTH_PREFIX.length)

    if (route === '/login')
      return method === 'GET'
        ? login(request)
        : jsonResponse(405, { error: 'method_not_allowed', message: 'Allowed: GET.' }, { allow: 'GET' })
    if (route === '/callback')
      return method === 'GET'
        ? callback(request)
        : jsonResponse(405, { error: 'method_not_allowed', message: 'Allowed: GET.' }, { allow: 'GET' })

    if (route === '/session') {
      if (method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed', message: 'Allowed: GET.' }, { allow: 'GET' })
      const found = await authenticate(request)
      if (!found) return jsonResponse(401, { error: 'unauthenticated', login: `${AUTH_PREFIX}/login` })
      return jsonResponse(200, { login: found.session.login, id: found.session.id }, found.cookie ? { 'set-cookie': found.cookie } : {})
    }

    if (route === '/logout') {
      // POST only, and only from this site: a GET or a cross-site POST must not be able to sign a person out.
      if (method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed', message: 'Allowed: POST.' }, { allow: 'POST' })
      if (!isSameOriginRequest(request.headers, request.url))
        return jsonResponse(403, { error: 'forbidden', message: 'Cross-site request refused.' })
      return new Response(null, {
        status: 204,
        headers: { 'set-cookie': cookie(request, names(request).session, '', 0), 'cache-control': 'no-store' },
      })
    }

    return jsonResponse(404, { error: 'not_found', message: 'Unknown sign-in route.' })
  }

  return { handle, authenticate }
}
