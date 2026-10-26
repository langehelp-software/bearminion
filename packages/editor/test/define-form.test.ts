import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormError, defineForm, verifyTurnstile, type FormHandler, type FormOptions, type FormSubmission } from '../src/forms/index.js'

const site = 'https://example.com'

function post(body: unknown, init: { type?: string; headers?: Record<string, string>; url?: string } = {}): Request {
  const type = init.type ?? 'application/json'
  const payload = body instanceof FormData || typeof body === 'string' || body instanceof URLSearchParams ? body : JSON.stringify(body)
  return new Request(init.url ?? `${site}/api/contact`, {
    method: 'POST',
    headers: body instanceof FormData ? { ...init.headers } : { 'content-type': type, ...init.headers },
    body: payload,
  })
}

async function run(handler: FormHandler, request: Request, options?: FormOptions, env: Record<string, string> = {}) {
  const response = await defineForm(handler, options).fetch(request, env)
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: text === '' ? undefined : (JSON.parse(text) as Record<string, unknown>),
  }
}

const message = { formId: 'contact', page: '/contact', name: 'Ada', email: 'ada@example.com', message: 'Hello' }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('defineForm', () => {
  it('hands the handler the message and answers ok for no return value', async () => {
    const seen: FormSubmission[] = []
    const result = await run((submission) => void seen.push(submission), post(message))
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
    expect(result.headers.get('content-type')).toContain('application/json')
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(seen).toEqual([message])
  })

  it('reads multipart and urlencoded posts with the same keys, and leaves out files and non-text values', async () => {
    const seen: FormSubmission[] = []
    const handler: FormHandler = (submission) => void seen.push(submission)
    const form = new FormData()
    for (const [name, value] of Object.entries(message)) form.append(name, value)
    form.append('attachment', new Blob(['x']), 'x.txt')
    expect((await run(handler, post(form))).status).toBe(200)
    expect((await run(handler, post(new URLSearchParams(message), { type: 'application/x-www-form-urlencoded' }))).status).toBe(200)
    expect((await run(handler, post({ ...message, count: 3, nested: { a: 1 } }))).status).toBe(200)
    expect(seen).toEqual([message, message, message])
  })

  it('gives formId and page empty strings when a bare post leaves them out, and ignores __proto__', async () => {
    const seen: FormSubmission[] = []
    await run((submission) => void seen.push(submission), post('{"name":"Ada","__proto__":"x"}'))
    expect(seen).toEqual([{ formId: '', page: '', name: 'Ada' }])
    expect(Object.getPrototypeOf(seen[0])).toBe(Object.prototype)
  })

  it('answers a success message from the handler, trimmed, and nothing for an empty one', async () => {
    expect((await run(() => ({ ok: true, message: '  We will write back today.  ' }), post(message))).body).toEqual({
      ok: true,
      message: 'We will write back today.',
    })
    expect((await run(() => ({ ok: true, message: '   ' }), post(message))).body).toEqual({ ok: true })
  })

  it('turns a returned refusal into 422 with field errors and 400 without', async () => {
    const withFields = await run(() => ({ ok: false, error: 'Check the form.', fieldErrors: { email: 'No.' } }), post(message))
    expect(withFields.status).toBe(422)
    expect(withFields.body).toEqual({ ok: false, error: 'Check the form.', fieldErrors: { email: 'No.' } })
    const plain = await run(() => ({ ok: false, error: 'Closed today.' }), post(message))
    expect(plain.status).toBe(400)
    expect(plain.body).toEqual({ ok: false, error: 'Closed today.' })
  })

  it('turns a thrown FormError into its text and status, from this copy of the package or another', async () => {
    const field = await run(() => {
      throw new FormError('Fix it.', { fieldErrors: { name: 'Required.' } })
    }, post(message))
    expect(field).toMatchObject({ status: 422, body: { ok: false, error: 'Fix it.', fieldErrors: { name: 'Required.' } } })
    const status = await run(() => {
      throw new FormError('Busy.', { status: 503 })
    }, post(message))
    expect(status).toMatchObject({ status: 503, body: { ok: false, error: 'Busy.' } })
    expect(new FormError('x', { status: 200 }).status).toBe(400)
    // Another copy of the package builds an error with the same brand; the check is by brand, not instanceof.
    const brand = Object.getOwnPropertySymbols(new FormError('x'))[0]
    if (!brand) throw new Error('FormError has no brand')
    const foreign = Object.assign(new Error('Foreign.'), { status: 409, [brand]: true })
    expect(
      (
        await run(() => {
          throw foreign
        }, post(message))
      ).status,
    ).toBe(409)
  })

  it('answers any other thrown error with a plain 502 and keeps the cause in the log only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await run(() => {
      throw new Error('Resend answered 401: key re_secret is invalid')
    }, post(message))
    expect(result.status).toBe(502)
    expect(result.body).toEqual({ ok: false, error: 'The message could not be delivered. Try again later.' })
    expect(JSON.stringify(result.body)).not.toContain('re_secret')
    expect(log).toHaveBeenCalled()
  })

  it('refuses a handler that returns something it does not understand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await run((() => 'sent') as unknown as FormHandler, post(message))
    expect(result.status).toBe(500)
    expect(result.body).toMatchObject({ ok: false })
  })

  it('passes the environment and a bodyless request to the handler', async () => {
    let seen: { key?: string | undefined; ip?: string | null; method?: string; dev?: boolean; body?: boolean } = {}
    await defineForm((_submission, { env, request, dev }) => {
      seen = { key: env.API_KEY, ip: request.headers.get('x-forwarded-for'), method: request.method, dev, body: request.body !== null }
    }).fetch(post(message, { headers: { 'x-forwarded-for': '203.0.113.9' } }), { API_KEY: 'abc' })
    expect(seen).toEqual({ key: 'abc', ip: '203.0.113.9', method: 'POST', dev: false, body: false })
  })

  it('answers only POST, with the CORS preflight for the site itself', async () => {
    const form = defineForm(() => undefined)
    const get = await form.fetch(new Request(`${site}/api/contact`))
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST, OPTIONS')
    const options = await form.fetch(new Request(`${site}/api/contact`, { method: 'OPTIONS' }))
    expect(options.status).toBe(204)
  })

  it('refuses a post that is too large, not JSON or form data, or unreadable', async () => {
    const handler = vi.fn()
    const tooBig = await run(handler, post({ ...message, message: 'x'.repeat(200) }), { maxBytes: 100 })
    expect(tooBig.status).toBe(413)
    const text = await run(handler, post('hello', { type: 'text/plain' }))
    expect(text.status).toBe(415)
    const broken = await run(handler, post('{nope'))
    expect(broken.status).toBe(400)
    const array = await run(handler, post('[1,2]'))
    expect(array.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('caps the size of a body with no Content-Length as it streams in', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"message":"'))
        controller.enqueue(new TextEncoder().encode('y'.repeat(500)))
        controller.close()
      },
    })
    const request = new Request(`${site}/api/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect((await run(vi.fn(), request, { maxBytes: 100 })).status).toBe(413)
  })

  it('drops a filled trap with a success and never calls the handler or Turnstile', async () => {
    const handler = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await run(
      handler,
      post({ ...message, _gotcha: 'https://spam.example' }),
      { turnstile: true },
      { TURNSTILE_SECRET_KEY: 's' },
    )
    expect(result).toMatchObject({ status: 200, body: { ok: true } })
    expect(handler).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('never passes the trap field or the Turnstile token to the handler', async () => {
    const seen: FormSubmission[] = []
    await run((submission) => void seen.push(submission), post({ ...message, _gotcha: '', 'cf-turnstile-response': 'tok' }))
    expect(seen[0]).toEqual(message)
  })

  it('dry run reports the message and answers ok without calling the handler', async () => {
    const handler = vi.fn()
    const report = vi.fn()
    const response = await defineForm(handler).fetch(post(message), {}, { dryRun: report })
    expect(response.status).toBe(200)
    expect(report).toHaveBeenCalledWith(message)
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('origins', () => {
  const handler = () => undefined

  it('allows a post from the same site and one with no Origin', async () => {
    expect((await run(handler, post(message, { headers: { origin: site } }))).status).toBe(200)
    expect((await run(handler, post(message))).status).toBe(200)
  })

  it('refuses another site unless it is listed, and then answers with the CORS headers', async () => {
    const other = { headers: { origin: 'https://www.example.org' } }
    const refused = await run(handler, post(message, other))
    expect(refused.status).toBe(403)
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()

    const listed = await run(handler, post(message, other), { origins: ['https://www.example.org'] })
    expect(listed.status).toBe(200)
    expect(listed.headers.get('access-control-allow-origin')).toBe('https://www.example.org')
    expect(listed.headers.get('vary')).toBe('Origin')

    const any = await run(handler, post(message, other), { origins: ['*'] })
    expect(any.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers the preflight of a listed site', async () => {
    const form = defineForm(handler, { origins: ['https://www.example.org'] })
    const preflight = await form.fetch(
      new Request(`${site}/api/contact`, { method: 'OPTIONS', headers: { origin: 'https://www.example.org' } }),
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://www.example.org')
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type')
    const stranger = await form.fetch(
      new Request(`${site}/api/contact`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    )
    expect(stranger.status).toBe(403)
  })
})

describe('turnstile', () => {
  const withToken = { ...message, 'cf-turnstile-response': 'good-token' }
  const env = { TURNSTILE_SECRET_KEY: 'secret' }

  function cloudflare(answer: unknown) {
    const spy = vi.fn(async () => new Response(JSON.stringify(answer)))
    vi.stubGlobal('fetch', spy)
    return spy
  }

  it('lets a genuine token through, asking Cloudflare with the secret, the token and the visitor address', async () => {
    const spy = cloudflare({ success: true })
    const handler = vi.fn()
    const result = await run(handler, post(withToken, { headers: { 'cf-connecting-ip': '198.51.100.7' } }), { turnstile: true }, env)
    expect(result.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
    const call = spy.mock.calls[0] as unknown as [string, { method: string; body: URLSearchParams }]
    expect(call[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(call[1].method).toBe('POST')
    expect(Object.fromEntries(call[1].body)).toEqual({ secret: 'secret', response: 'good-token', remoteip: '198.51.100.7' })
  })

  it('refuses a missing or rejected token with 422 and does not call the handler', async () => {
    const handler = vi.fn()
    const missing = await run(handler, post(message), { turnstile: true }, env)
    expect(missing.status).toBe(422)
    cloudflare({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    const rejected = await run(handler, post(withToken), { turnstile: true }, env)
    expect(rejected).toMatchObject({ status: 422, body: { ok: false, error: expect.stringContaining('spam check') } })
    expect(handler).not.toHaveBeenCalled()
  })

  it("reads the secret from the variable you name, and says a missing or wrong secret is the site's fault", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = vi.fn()
    const named = cloudflare({ success: true })
    expect((await run(handler, post(withToken), { turnstile: { secretEnv: 'MY_SECRET' } }, { MY_SECRET: 'x' })).status).toBe(200)
    expect(named).toHaveBeenCalled()
    const missing = await run(handler, post(withToken), { turnstile: true }, {})
    expect(missing.status).toBe(500)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('TURNSTILE_SECRET_KEY'))
    cloudflare({ success: false, 'error-codes': ['invalid-input-secret'] })
    expect((await run(handler, post(withToken), { turnstile: true }, env)).status).toBe(500)
  })

  it('answers 502 when Cloudflare cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const handler = vi.fn()
    expect((await run(handler, post(withToken), { turnstile: true }, env)).status).toBe(502)
    expect(handler).not.toHaveBeenCalled()
  })

  it('verifyTurnstile reports the error codes', async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })))
    expect(await verifyTurnstile({ secret: 's', token: 't', fetch: send as unknown as typeof fetch })).toEqual({
      success: false,
      codes: ['invalid-input-response'],
      misconfigured: false,
    })
  })
})
