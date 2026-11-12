import { describe, expect, it } from 'vitest'
import { AUTH_PREFIX, EDITOR_SCRIPT_PATH, createHostedAuth, createHostedEditor } from '../src/hosted.js'
import { API_PREFIX } from '../src/model.js'
import { stableStringify } from '../src/stable-json.js'
import { FakeGithub } from './fake-github.js'
import { sectionRegistry, siteDefinition } from './starter.js'

const ORIGIN = 'https://admin.example.com'
const SECRET = 'a-secret-with-at-least-thirty-two-characters'
const site = { name: 'Hosted', url: 'https://hosted.example', seo: {}, header: { links: [] }, footer: { columns: [] } }
const encoder = new TextEncoder()

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** GitHub as the sign-in sees it: the authorize redirect, the token endpoint, `/user`, the repo's permissions, and the content API behind them. */
function world(options: { sessionDays?: number; allowedLogins?: string[] } = {}) {
  const github = new FakeGithub({ files: { 'content/site.json': stableStringify(site) } })
  let clock = Date.parse('2026-11-11T08:00:00Z')
  const users: Record<string, { login: string; id: number; push: boolean }> = {
    'tok-ann': { login: 'ann', id: 1, push: true },
    'tok-ann-2': { login: 'ann', id: 1, push: true },
    'tok-bob': { login: 'bob', id: 2, push: false },
    'tok-cat': { login: 'Cat', id: 3, push: true },
  }
  const codes: Record<string, { token: string; refresh?: string; challenge?: string }> = {}
  const refreshes: Record<string, string> = { 'ref-ann': 'tok-ann-2' }
  const contentTokens: string[] = []
  const tokenCalls: Record<string, string>[] = []
  let expiresIn = 3600
  let refreshWorks = true

  const fetchFake: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init?.headers)
    const token = headers.get('authorization')?.replace('Bearer ', '') ?? ''
    if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
      const body = JSON.parse(String(init?.body)) as Record<string, string>
      tokenCalls.push(body)
      if (body.client_id !== 'client-1' || body.client_secret !== 'secret-1') return Response.json({ error: 'bad_client' })
      if (body.grant_type === 'refresh_token') {
        const next = refreshWorks ? refreshes[body.refresh_token ?? ''] : undefined
        return next
          ? Response.json({
              access_token: next,
              expires_in: expiresIn,
              refresh_token: 'ref-ann-next',
              refresh_token_expires_in: 86_400 * 100,
            })
          : Response.json({ error: 'bad_refresh_token' })
      }
      const issued = codes[body.code ?? '']
      if (!issued) return Response.json({ error: 'bad_verification_code' })
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body.code_verifier ?? ''))))
      if (issued.challenge !== challenge) return Response.json({ error: 'bad_verification_code' })
      return Response.json({
        access_token: issued.token,
        expires_in: expiresIn,
        ...(issued.refresh ? { refresh_token: issued.refresh, refresh_token_expires_in: 86_400 * 100 } : {}),
      })
    }
    if (url.origin === 'https://api.github.com' && url.pathname === '/user') {
      const user = users[token]
      return user ? Response.json({ login: user.login, id: user.id }) : Response.json({ message: 'Bad credentials' }, { status: 401 })
    }
    if (url.origin === 'https://api.github.com' && url.pathname === '/repos/acme/site') {
      const user = users[token]
      return user
        ? Response.json({ default_branch: 'main', permissions: { push: user.push, pull: true } })
        : Response.json({ message: 'Not Found' }, { status: 404 })
    }
    if (url.pathname.startsWith('/repos/acme/site/')) contentTokens.push(token)
    return github.fetch(input, init)
  }

  const editor = createHostedEditor({
    sections: sectionRegistry,
    site: siteDefinition,
    repo: 'acme/site',
    auth: {
      clientId: 'client-1',
      clientSecret: 'secret-1',
      secret: SECRET,
      origin: ORIGIN,
      ...(options.sessionDays ? { sessionDays: options.sessionDays } : {}),
      ...(options.allowedLogins ? { allowedLogins: options.allowedLogins } : {}),
    },
    overlay: 'window.__overlay = true',
    fetch: fetchFake,
    now: () => clock,
  })

  async function call(
    method: string,
    pathname: string,
    init: { cookie?: string; headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<Response> {
    const response = await editor.handle(
      new Request(`${ORIGIN}${pathname}`, {
        method,
        redirect: 'manual',
        headers: {
          host: 'admin.example.com',
          ...(init.cookie ? { cookie: init.cookie } : {}),
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...init.headers,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    )
    if (response === null) throw new Error(`no response for ${pathname}`)
    return response
  }

  const same = { 'sec-fetch-site': 'same-origin', origin: ORIGIN }
  const cookiesOf = (response: Response): string[] => response.headers.getSetCookie().map((line) => line.split(';')[0] ?? '')

  /** Walks sign-in as `token`: login, GitHub's redirect back with a code, the callback. */
  async function signIn(token: string, returnTo?: string, refresh?: string) {
    const login = await call('GET', `${AUTH_PREFIX}/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)
    const authorize = new URL(login.headers.get('location') ?? '')
    const stateCookie = cookiesOf(login).join('; ')
    const code = `code-${Object.keys(codes).length}`
    codes[code] = { token, ...(refresh ? { refresh } : {}), challenge: authorize.searchParams.get('code_challenge') ?? '' }
    const callback = await call('GET', `${AUTH_PREFIX}/callback?code=${code}&state=${authorize.searchParams.get('state')}`, {
      cookie: stateCookie,
    })
    const session = cookiesOf(callback).find((cookie) => cookie.startsWith('__Host-bm-session=') && !cookie.endsWith('='))
    return { login, authorize, stateCookie, callback, session }
  }

  async function inject(cookie: string | undefined, response: Response, method = 'GET'): Promise<Response> {
    return editor.inject(new Request(`${ORIGIN}/about`, { method, headers: cookie ? { cookie } : {} }), response)
  }

  return {
    github,
    call,
    signIn,
    inject,
    same,
    cookiesOf,
    contentTokens,
    tokenCalls,
    advance: (ms: number) => (clock += ms),
    setExpiresIn: (value: number) => (expiresIn = value),
    breakRefresh: () => (refreshWorks = false),
  }
}

describe('createHostedAuth options', () => {
  it('validates repo, client and secret', () => {
    const base = { clientId: 'a', clientSecret: 'b', secret: SECRET, repo: 'acme/site' }
    expect(() => createHostedAuth({ ...base, repo: 'nope' })).toThrow(/owner\/name/)
    expect(() => createHostedAuth({ ...base, clientSecret: '' })).toThrow(/clientId and clientSecret/)
    expect(() => createHostedAuth({ ...base, secret: 'short' })).toThrow(/32 characters/)
  })
})

describe('sign-in', () => {
  it('sends the person to GitHub with state and a PKCE challenge, and keeps the secrets in an encrypted cookie', async () => {
    const { call } = world()
    const login = await call('GET', `${AUTH_PREFIX}/login?returnTo=/editor`)
    expect(login.status).toBe(302)
    const authorize = new URL(login.headers.get('location') ?? '')
    expect(authorize.origin + authorize.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(authorize.searchParams.get('client_id')).toBe('client-1')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${ORIGIN}${AUTH_PREFIX}/callback`)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('state')).toHaveLength(22)
    const cookie = login.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^__Host-bm-state=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).not.toContain(authorize.searchParams.get('state') ?? 'x')
  })

  it('completes the flow: session cookie, return to the page asked for, and the editor API on the person’s own token', async () => {
    const { signIn, call, same, contentTokens, github } = world()
    const { callback, session } = await signIn('tok-ann', '/blog')
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/blog')
    expect(session).toBeDefined()
    const cookie = callback.headers.getSetCookie().find((line) => line.startsWith('__Host-bm-session=')) ?? ''
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).not.toContain('tok-ann')

    const who = await call('GET', `${AUTH_PREFIX}/session`, { cookie: session ?? '' })
    expect(await who.json()).toEqual({ login: 'ann', id: 1 })

    const read = await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })
    expect(read.status).toBe(200)
    expect(((await read.json()) as { name: string }).name).toBe('Hosted')
    const created = await call('POST', `${API_PREFIX}/pages`, {
      cookie: session ?? '',
      headers: same,
      body: { slug: 'about', title: 'About' },
    })
    expect(created.status).toBe(201)
    expect(github.text('content/pages/about.json')).toContain('"About"')
    expect(new Set(contentTokens)).toEqual(new Set(['tok-ann']))
  })

  it('does not follow a returnTo that leaves the site', async () => {
    const { signIn } = world()
    for (const target of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect((await signIn('tok-ann', target)).callback.headers.get('location'), target).toBe('/')
    }
  })

  it('refuses a callback with the wrong state, no state cookie, or a replayed code', async () => {
    const { call, signIn } = world()
    const first = await signIn('tok-ann')
    const state = first.authorize.searchParams.get('state') ?? ''
    expect((await call('GET', `${AUTH_PREFIX}/callback?code=code-0&state=${state}x`, { cookie: first.stateCookie })).status).toBe(400)
    expect((await call('GET', `${AUTH_PREFIX}/callback?code=code-0&state=${state}`)).status).toBe(400)
    // Another person's state cookie from a different attempt does not match this state either.
    const second = await call('GET', `${AUTH_PREFIX}/login`)
    const otherCookie = (second.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    expect((await call('GET', `${AUTH_PREFIX}/callback?code=code-0&state=${state}`, { cookie: otherCookie })).status).toBe(400)
  })

  it('rejects a code redeemed with the wrong PKCE verifier', async () => {
    const { call, tokenCalls } = world()
    const login = await call('GET', `${AUTH_PREFIX}/login`)
    const authorize = new URL(login.headers.get('location') ?? '')
    const callback = await call('GET', `${AUTH_PREFIX}/callback?code=unknown&state=${authorize.searchParams.get('state')}`, {
      cookie: (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
    })
    expect(callback.status).toBe(502)
    expect(tokenCalls[0]?.code_verifier).toHaveLength(43)
  })

  it('refuses a person without push access and sets no session', async () => {
    const { signIn } = world()
    const { callback, session } = await signIn('tok-bob')
    expect(callback.status).toBe(403)
    expect(await callback.text()).toContain('bob cannot write to acme/site')
    expect(session).toBeUndefined()
  })

  it('lets only the listed logins in, whatever the case', async () => {
    const { signIn, github } = world({ allowedLogins: ['ANN', ' cat '] })
    const ann = await signIn('tok-ann')
    expect(ann.callback.status).toBe(302)
    expect(ann.session).toBeDefined()
    expect((await signIn('tok-cat')).callback.status).toBe(302)
    expect(github.requests).toHaveLength(0)
  })

  it('refuses a person with push access who is not on the list, and sets no session', async () => {
    const { signIn } = world({ allowedLogins: ['ann'] })
    const { callback, session } = await signIn('tok-cat')
    expect(callback.status).toBe(403)
    expect(await callback.text()).toContain('Cat is not on the list')
    expect(session).toBeUndefined()
  })

  it('signs a person out on the next request once the login leaves the list', async () => {
    const before = world({ allowedLogins: ['ann', 'cat'] })
    const { session } = await before.signIn('tok-cat')
    expect(session).toBeDefined()
    const after = world({ allowedLogins: ['ann'] })
    const response = await after.call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: after.same })
    expect(response.status).toBe(401)
    const still = await before.call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: before.same })
    expect(still.status).toBe(200)
  })

  it('refuses an empty list instead of locking everyone out', () => {
    expect(() => world({ allowedLogins: [] })).toThrow(/allowedLogins is empty/)
  })
})

describe('the editor API behind sign-in', () => {
  it('answers 401 with a login link when nobody is signed in, and touches nothing', async () => {
    const { call, same, github } = world()
    const response = await call('GET', `${API_PREFIX}/site`, { headers: same })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'unauthenticated', login: `${AUTH_PREFIX}/login` })
    expect(github.requests).toHaveLength(0)
  })

  it('answers 401 for a tampered, truncated or foreign cookie, and for a state cookie used as a session', async () => {
    const { call, same, signIn } = world()
    const { session, stateCookie } = await signIn('tok-ann')
    const value = (session ?? '').split('=')[1] ?? ''
    const flipped = `${value.slice(0, -2)}${value.endsWith('AA') ? 'BB' : 'AA'}`
    for (const cookie of [
      `__Host-bm-session=${flipped}`,
      `__Host-bm-session=${value.slice(0, 10)}`,
      '__Host-bm-session=',
      `__Host-bm-session=${stateCookie.split('=')[1]}`,
    ]) {
      expect((await call('GET', `${API_PREFIX}/site`, { cookie, headers: same })).status, cookie.slice(0, 40)).toBe(401)
    }
  })

  it('refuses cross-site requests even with a valid session', async () => {
    const { call, signIn, github } = world()
    const { session } = await signIn('tok-ann')
    const before = github.requests.length
    const forged = await call('POST', `${API_PREFIX}/pages`, {
      cookie: session ?? '',
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      body: { slug: 'x', title: 'X' },
    })
    expect(forged.status).toBe(403)
    expect(github.requests.length).toBe(before)
  })

  it('ends a session after sessionDays', async () => {
    const { call, signIn, same, advance } = world({ sessionDays: 1 })
    const { session } = await signIn('tok-ann')
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })).status).toBe(200)
    advance(25 * 3600 * 1000)
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })).status).toBe(401)
  })

  it('renews an expiring token with the refresh token and sets the new cookie on the answer', async () => {
    const { call, signIn, same, advance, contentTokens, cookiesOf } = world()
    const { session } = await signIn('tok-ann', undefined, 'ref-ann')
    advance(3550 * 1000)
    const response = await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })
    expect(response.status).toBe(200)
    expect(contentTokens.at(-1)).toBe('tok-ann-2')
    const renewed = cookiesOf(response).find((cookie) => cookie.startsWith('__Host-bm-session='))
    expect(renewed).toBeDefined()
    expect(renewed).not.toBe(session)
    // The renewed cookie works on its own.
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: renewed ?? '', headers: same })).status).toBe(200)
  })

  it('shares one renewal between requests that arrive together, since a refresh token works once', async () => {
    const { call, signIn, same, advance, tokenCalls, contentTokens, cookiesOf } = world()
    const { session } = await signIn('tok-ann', undefined, 'ref-ann')
    advance(3550 * 1000)
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })),
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200, 200])
    expect(tokenCalls.filter((body) => body.grant_type === 'refresh_token')).toHaveLength(1)
    expect(new Set(contentTokens.slice(-5))).toEqual(new Set(['tok-ann-2']))
    const cookies = answers.map((answer) => cookiesOf(answer).find((cookie) => cookie.startsWith('__Host-bm-session=')))
    expect(new Set(cookies).size).toBe(1)
  })

  it('lets a request that lost the race to renew carry on with the token while it still works', async () => {
    const { call, signIn, same, advance, breakRefresh, cookiesOf } = world()
    const { session } = await signIn('tok-ann', undefined, 'ref-ann')
    breakRefresh()
    advance(3550 * 1000)
    const answer = await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })
    expect(answer.status).toBe(200)
    expect(cookiesOf(answer).find((cookie) => cookie.startsWith('__Host-bm-session='))).toBeUndefined()
    // Once the token has expired, there is nothing left to carry on with.
    advance(60 * 1000)
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })).status).toBe(401)
  })

  it('signs the person out when the token cannot be renewed', async () => {
    const { call, signIn, same, advance, breakRefresh } = world()
    const { session } = await signIn('tok-ann', undefined, 'ref-ann')
    breakRefresh()
    advance(3601 * 1000)
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: session ?? '', headers: same })).status).toBe(401)
    // No refresh token at all: the session ends with the token.
    const bare = await signIn('tok-ann')
    advance(3600 * 1000)
    expect((await call('GET', `${API_PREFIX}/site`, { cookie: bare.session ?? '', headers: same })).status).toBe(401)
  })

  it('logs out by POST from the same site only', async () => {
    const { call, signIn, same, cookiesOf } = world()
    const { session } = await signIn('tok-ann')
    expect((await call('GET', `${AUTH_PREFIX}/logout`, { cookie: session ?? '' })).status).toBe(405)
    expect(
      (await call('POST', `${AUTH_PREFIX}/logout`, { cookie: session ?? '', headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403)
    const out = await call('POST', `${AUTH_PREFIX}/logout`, { cookie: session ?? '', headers: same })
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/)
    expect(cookiesOf(out)).toEqual(['__Host-bm-session='])
  })

  it('leaves other paths to the site', async () => {
    const { call } = world()
    await expect(call('GET', '/about')).rejects.toThrow('no response')
  })
})

describe('images from the repository', () => {
  it('serves an image to a signed-in person on their token, and to nobody else', async () => {
    const { call, signIn, github, contentTokens } = world()
    github.push({ 'src/assets/uploads/a.png': 'not-really-a-png' })
    const route = '/__bearminion/assets?src=src%2Fassets%2Fuploads%2Fa.png'
    expect((await call('GET', route)).status).toBe(401)
    const { session } = await signIn('tok-ann')
    const image = await call('GET', route, { cookie: session ?? '' })
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/png')
    expect(await image.text()).toBe('not-really-a-png')
    expect(contentTokens.at(-1)).toBe('tok-ann')
    expect((await call('GET', '/__bearminion/assets?src=content%2Fsite.json', { cookie: session ?? '' })).status).toBe(404)
  })
})

describe('the overlay', () => {
  const page = () =>
    new Response('<!doctype html><html><body><h1>About</h1></body></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"', 'content-length': '57' },
    })

  it('serves the script to a signed-in person only', async () => {
    const { call, signIn } = world()
    expect((await call('GET', EDITOR_SCRIPT_PATH)).status).toBe(401)
    const { session } = await signIn('tok-ann')
    const script = await call('GET', EDITOR_SCRIPT_PATH, { cookie: session ?? '' })
    expect(script.status).toBe(200)
    expect(script.headers.get('content-type')).toContain('text/javascript')
    expect(script.headers.get('cache-control')).toBe('private, no-cache')
    expect(await script.text()).toBe('window.__overlay = true')
    expect((await call('POST', EDITOR_SCRIPT_PATH, { cookie: session ?? '' })).status).toBe(405)
  })

  it('adds the script to a page for a signed-in person, and marks the page so no cache keeps it', async () => {
    const { signIn, inject } = world()
    const { session } = await signIn('tok-ann')
    const out = await inject(session, page())
    expect(await out.text()).toBe(
      `<!doctype html><html><body><h1>About</h1><script type="module" src="${EDITOR_SCRIPT_PATH}"></script></body></html>`,
    )
    expect(out.headers.get('cache-control')).toBe('private, no-store')
    expect(out.headers.get('vary')).toBe('Cookie')
    expect(out.headers.get('content-length')).toBeNull()
    expect(out.headers.get('etag')).toBeNull()
  })

  it('leaves the page alone for a visitor, a tampered cookie, a non-page, a failed page and a non-GET', async () => {
    const { signIn, inject } = world()
    const { session } = await signIn('tok-ann')
    const original = '<html><body>x</body></html>'
    const html = () => new Response(original, { headers: { 'content-type': 'text/html' } })
    for (const out of [
      await inject(undefined, html()),
      await inject('__Host-bm-session=nope', html()),
      await inject(session, new Response('{}', { headers: { 'content-type': 'application/json' } })),
      await inject(session, new Response(original, { status: 404, headers: { 'content-type': 'text/html' } })),
      await inject(session, html(), 'POST'),
    ]) {
      expect(await out.text()).not.toContain(EDITOR_SCRIPT_PATH)
    }
    const visitor = await inject(undefined, html())
    expect(visitor.headers.get('cache-control')).toBeNull()
  })

  it('adds the script once, and at the end when there is no body tag', async () => {
    const { signIn, inject } = world()
    const { session } = await signIn('tok-ann')
    const again = await (await inject(session, await inject(session, page()))).text()
    expect(again.split(EDITOR_SCRIPT_PATH)).toHaveLength(2)
    const bare = await inject(session, new Response('<p>fragment</p>', { headers: { 'content-type': 'text/html' } }))
    expect(await bare.text()).toBe(`<p>fragment</p><script type="module" src="${EDITOR_SCRIPT_PATH}"></script>`)
  })

  it('is not served when no overlay is configured', async () => {
    const editor = createHostedEditor({
      sections: sectionRegistry,
      site: siteDefinition,
      repo: 'acme/site',
      auth: { clientId: 'c', clientSecret: 's', secret: SECRET, origin: ORIGIN },
    })
    expect(await editor.handle(new Request(`${ORIGIN}${EDITOR_SCRIPT_PATH}`))).toBeNull()
    const html = new Response('<body></body>', { headers: { 'content-type': 'text/html' } })
    expect(await (await editor.inject(new Request(`${ORIGIN}/`), html)).text()).toBe('<body></body>')
  })
})
