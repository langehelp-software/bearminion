import { describe, expect, it } from 'vitest'
import { AUTH_PREFIX, type HostedEditor, type HostedScope, createHostedMiddleware } from '../src/hosted.js'

const scope = { login: 'ann', store: {}, content: {} } as unknown as HostedScope

function editorFor(options: { signedIn: boolean; handled?: Response }) {
  const calls: string[] = []
  const editor = {
    async handle() {
      calls.push('handle')
      return options.handled ?? null
    },
    async scope() {
      calls.push('scope')
      return options.signedIn ? scope : null
    },
    async inject(_request: Request, response: Response) {
      calls.push('inject')
      return response
    },
    auth: {},
  } as unknown as HostedEditor
  return { editor, calls }
}

const page = (path = '/about?x=1', headers: Record<string, string> = { accept: 'text/html' }) =>
  new Request(`https://admin.example.com${path}`, { headers })

describe('createHostedMiddleware', () => {
  it('lets the editor answer its own routes first', async () => {
    const { editor, calls } = editorFor({ signedIn: false, handled: new Response('login') })
    const response = await createHostedMiddleware(editor)(
      { request: page(`${AUTH_PREFIX}/login`), locals: {} },
      async () => new Response('site'),
    )
    expect(await response.text()).toBe('login')
    expect(calls).toEqual(['handle'])
  })

  it('sends a visitor to sign in and back to the page they asked for', async () => {
    const { editor } = editorFor({ signedIn: false })
    let rendered = false
    const response = await createHostedMiddleware(editor)({ request: page(), locals: {} }, async () => {
      rendered = true
      return new Response('site')
    })
    expect(rendered).toBe(false)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`${AUTH_PREFIX}/login?returnTo=${encodeURIComponent('/about?x=1')}`)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 401 to a visitor’s request that is not a page load', async () => {
    const { editor } = editorFor({ signedIn: false })
    const response = await createHostedMiddleware(editor)(
      { request: page('/data.json', { accept: '*/*' }), locals: {} },
      async () => new Response('x'),
    )
    expect(response.status).toBe(401)
    const post = new Request('https://admin.example.com/about', { method: 'POST', headers: { accept: 'text/html' } })
    expect((await createHostedMiddleware(editor)({ request: post, locals: {} }, async () => new Response('x'))).status).toBe(401)
  })

  it('treats a navigation by Sec-Fetch-Dest, whatever Accept says', async () => {
    const { editor } = editorFor({ signedIn: false })
    const script = page('/app.js', { 'sec-fetch-dest': 'script', accept: 'text/html' })
    expect((await createHostedMiddleware(editor)({ request: script, locals: {} }, async () => new Response('x'))).status).toBe(401)
    const doc = page('/about', { 'sec-fetch-dest': 'document', accept: '*/*' })
    expect((await createHostedMiddleware(editor)({ request: doc, locals: {} }, async () => new Response('x'))).status).toBe(302)
  })

  it('gives a signed-in person the scope and the overlay', async () => {
    const { editor, calls } = editorFor({ signedIn: true })
    const locals: { bearminion?: unknown } = {}
    const response = await createHostedMiddleware(editor)({ request: page(), locals }, async () => {
      calls.push('next')
      return new Response('site')
    })
    expect(await response.text()).toBe('site')
    expect(locals.bearminion).toBe(scope)
    expect(calls).toEqual(['handle', 'scope', 'next', 'inject'])
  })

  it('in optional mode shows visitors the site as it is', async () => {
    const { editor, calls } = editorFor({ signedIn: false })
    const locals: { bearminion?: unknown } = {}
    const response = await createHostedMiddleware(editor, { signIn: 'optional' })(
      { request: page(), locals },
      async () => new Response('site'),
    )
    expect(await response.text()).toBe('site')
    expect(locals.bearminion).toBeUndefined()
    expect(calls).not.toContain('inject')
  })
})
