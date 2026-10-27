import { HONEYPOT_FIELD, TURNSTILE_FIELD, type FormFieldErrors, type FormResult, type FormSubmission } from '../form-contract.js'
import { BodyError, DEFAULT_MAX_BYTES, parseFields, readBody } from './body.js'
import { TurnstileUnavailableError, verifyTurnstile } from './turnstile.js'

/** Environment variables by name: `process.env`, Cloudflare's `env`, `Netlify.env.toObject()`. */
export type FormEnv = Readonly<Record<string, string | undefined>>

/** What a handler is given besides the message. */
export interface FormContext {
  /** Your secrets and settings. Pass the host's environment to `form.fetch`; the glue files in the guide do. */
  env: FormEnv
  /** The incoming request without its body (already read): its headers and URL, for the visitor's address or language. */
  request: Request
  /** True while `astro dev` runs the handler. */
  dev: boolean
}

/**
 * What a handler may return. Nothing, or `{ ok: true }`, is a success; `message` replaces the thank-you text on the
 * page (plain text). `{ ok: false, error }` is a refusal the visitor sees. To fail with another status, throw a `FormError`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: a handler that returns nothing has the return type void, which `undefined` does not accept
export type FormHandlerResult = void | FormResult

export type FormHandler = (submission: FormSubmission, context: FormContext) => FormHandlerResult | Promise<FormHandlerResult>

export interface FormOptions {
  /**
   * Check a Cloudflare Turnstile token before the handler runs. Left out, the check runs whenever the environment has
   * `TURNSTILE_SECRET_KEY`, so setting the secret is the whole switch. `true` requires it (a missing secret refuses every
   * message), `false` turns the check off, and `{ secretEnv }` names another variable. The page needs the matching site
   * key at build time (`PUBLIC_TURNSTILE_SITE_KEY`). A genuine token must also come from your own site: its hostname has
   * to be the function's host, and `hostnames` adds others.
   */
  turnstile?: boolean | { secretEnv?: string; hostnames?: readonly string[] }
  /**
   * Other sites allowed to post here, such as `https://www.example.com`, or `'*'` for any. Posts from the form's own
   * site are always allowed. Needed only when the page and the function live on different addresses.
   */
  origins?: readonly string[]
  /** Largest post accepted, in bytes. Default 64 KB. */
  maxBytes?: number
}

/** How one request is run. The dev server uses this; hosts do not need it. */
export interface FormRunOptions {
  dev?: boolean
  /** Receive the message and answer success without calling the handler or Turnstile. */
  dryRun?: (submission: FormSubmission) => void
}

export interface Form {
  /** Answers one request. Give it the host's environment as `env`. */
  fetch(request: Request, env?: FormEnv, run?: FormRunOptions): Promise<Response>
}

const FORM_ERROR = Symbol.for('bearminion.form-error')

/**
 * Throw this from a handler to refuse the message with a text the visitor sees, instead of the generic "could not be
 * delivered". `fieldErrors` mark fields. The status is 422 with `fieldErrors` and 400 without, unless you give one.
 */
export class FormError extends Error {
  readonly status: number
  readonly fieldErrors: FormFieldErrors | undefined
  constructor(message: string, options: { fieldErrors?: FormFieldErrors; status?: number } = {}) {
    super(message)
    this.name = 'FormError'
    this.fieldErrors = options.fieldErrors
    const wanted = options.status ?? (options.fieldErrors ? 422 : 400)
    this.status = Number.isInteger(wanted) && wanted >= 400 && wanted <= 599 ? wanted : 400
    Object.defineProperty(this, FORM_ERROR, { value: true })
  }
}

function isFormError(error: unknown): error is FormError {
  return typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[FORM_ERROR] === true
}

const UNDELIVERED = 'The message could not be delivered. Try again later.'
const NOT_SET_UP = 'This form is not set up correctly. Please try again later.'
const SPAM_CHECK_FAILED = 'The spam check did not pass. Reload the page and try again.'
const SPAM_CHECK_UNAVAILABLE = 'The spam check could not be completed. Try again in a moment.'

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function reply(status: number, result: FormResult, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(result), { status, headers: { ...jsonHeaders, ...headers } })
}

const refuse = (status: number, error: string, headers?: Record<string, string>) => reply(status, { ok: false, error }, headers)

/** A browser posting the form itself (JavaScript off) asks for HTML. The script on the page asks for JSON. */
function isNavigation(request: Request): boolean {
  if (request.method !== 'POST') return false
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html') && !accept.includes('application/json')
}

/** The page the visitor came from, as a path. Only on this host: anything else would be an open redirect. */
function cameFrom(request: Request): string | null {
  const referer = request.headers.get('referer')
  if (!referer) return null
  try {
    const from = new URL(referer)
    if (from.host !== new URL(request.url).host) return null
    return `${from.pathname}${from.search}`
  } catch {
    return null
  }
}

/** Who may post, and the CORS headers that go with it. `null` means refuse. */
function originHeaders(request: Request, allowed: readonly string[]): Record<string, string> | null {
  const origin = request.headers.get('origin')
  // No Origin: not a browser page (curl, a server). Nothing to protect from.
  if (origin === null) return {}
  try {
    if (new URL(origin).host === new URL(request.url).host) return {}
  } catch {
    return null
  }
  const vary = { vary: 'Origin' }
  if (allowed.includes('*')) return { ...vary, 'access-control-allow-origin': '*' }
  if (allowed.includes(origin)) return { ...vary, 'access-control-allow-origin': origin }
  return null
}

const CORS_METHODS = {
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
  'access-control-max-age': '86400',
}

/**
 * The visitor's address, as a hint for Turnstile. The host's own headers come first. In `x-forwarded-for` the first
 * entry is whatever the visitor sent, and the last is what the nearest proxy saw, so the last is the one to use.
 */
function remoteIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-nf-client-connection-ip') ??
    headers.get('x-real-ip') ??
    forwarded?.[forwarded.length - 1]?.trim() ??
    undefined
  )
}

/** Cloudflare's test secrets begin like this. They are for trying the widget, so the hostname check does not apply to them. */
const TEST_SECRET = /^[123]x0{10}/

/**
 * Puts your function behind a form. It runs on your server with your keys, so a service's token never reaches the
 * browser. It gets the message the Contact form sent and returns what the visitor should see.
 *
 * ```ts
 * // src/forms/contact.ts
 * import { defineForm, FormError } from 'bearminion/forms'
 *
 * export default defineForm(async (submission, { env }) => {
 *   const response = await fetch('https://api.example.com/send', {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${env.EXAMPLE_API_KEY}` },
 *     body: JSON.stringify({ from: submission.email, text: submission.message }),
 *   })
 *   if (!response.ok) throw new FormError('The message could not be sent.', { status: 502 })
 * })
 * ```
 *
 * What it does around your function, whatever the host: answers only `POST` (and the CORS preflight), accepts JSON,
 * `multipart/form-data` and `application/x-www-form-urlencoded`, refuses a post over `maxBytes` and a post from another
 * site, drops a message whose trap field is filled (without calling you), checks Turnstile when asked, and turns what
 * you return or throw into the `{ ok, error, fieldErrors }` answer the page understands. It does not validate the
 * fields: the Contact form already does in the browser.
 */
export function defineForm(handler: FormHandler, options: FormOptions = {}): Form {
  if (typeof handler !== 'function') throw new TypeError('defineForm needs a function: defineForm(async (submission, { env }) => { ... }).')
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const allowed = options.origins ?? []
  /**
   * The variable that holds the secret, or undefined when this request is not checked. Asked for in the options, a missing
   * secret is an error; left to the default, a missing secret means the check is off.
   */
  const secretVariable = (env: FormEnv): string | undefined => {
    const given = options.turnstile
    if (given === false) return undefined
    if (given === true) return 'TURNSTILE_SECRET_KEY'
    if (typeof given === 'object') return given.secretEnv ?? 'TURNSTILE_SECRET_KEY'
    return env.TURNSTILE_SECRET_KEY ? 'TURNSTILE_SECRET_KEY' : undefined
  }
  const extraHostnames = (typeof options.turnstile === 'object' ? (options.turnstile.hostnames ?? []) : []).map((name) =>
    name.toLowerCase(),
  )

  async function answer(request: Request, env: FormEnv, run: FormRunOptions, seen: { formId: string }): Promise<Response> {
    const cors = originHeaders(request, allowed)
    if (cors === null) return refuse(403, 'This site is not allowed to send to this form.')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS_METHODS, ...cors } })
    if (request.method !== 'POST') return refuse(405, 'Send the form with POST.', { allow: 'POST, OPTIONS', ...cors })

    let fields: Record<string, string>
    try {
      fields = await parseFields(request.headers.get('content-type'), await readBody(request, maxBytes))
    } catch (error) {
      if (error instanceof BodyError) return refuse(error.status, error.message, cors)
      throw error
    }

    seen.formId = fields.formId ?? ''

    // A filled trap is a script. Say it worked, and call nobody.
    const trap = fields[HONEYPOT_FIELD]
    delete fields[HONEYPOT_FIELD]
    if (trap !== undefined && trap.trim() !== '') return reply(200, { ok: true }, cors)

    const token = fields[TURNSTILE_FIELD]
    delete fields[TURNSTILE_FIELD]
    const { formId = '', page = cameFrom(request)?.split('?')[0] ?? '', ...rest } = fields
    const submission: FormSubmission = { formId, page, ...rest }

    if (run.dryRun) {
      run.dryRun(submission)
      return reply(200, { ok: true }, cors)
    }

    const secretEnv = secretVariable(env)
    if (secretEnv !== undefined) {
      const secret = env[secretEnv]
      if (!secret) {
        console.error(`[bearminion] This form checks Turnstile, but the environment variable ${secretEnv} is not set.`)
        return refuse(500, NOT_SET_UP, cors)
      }
      if (!token) return refuse(422, SPAM_CHECK_FAILED, cors)
      try {
        const ip = remoteIp(request.headers)
        const outcome = await verifyTurnstile({ secret, token, ...(ip ? { remoteIp: ip } : {}) })
        if (outcome.success) {
          const hostname = outcome.hostname?.toLowerCase()
          const ownHost = new URL(request.url).hostname.toLowerCase()
          if (hostname !== undefined && !TEST_SECRET.test(secret) && hostname !== ownHost && !extraHostnames.includes(hostname)) {
            console.error(
              `[bearminion] Turnstile says the widget was served on ${hostname}, but this form runs on ${ownHost}. If that site is yours, list it: turnstile: { hostnames: ['${hostname}'] }.`,
            )
            return refuse(422, SPAM_CHECK_FAILED, cors)
          }
        } else {
          if (outcome.misconfigured) {
            console.error(
              `[bearminion] Turnstile refused the secret key in ${secretEnv} (${outcome.codes.join(', ')}). Check it in the Cloudflare dashboard.`,
            )
            return refuse(500, NOT_SET_UP, cors)
          }
          return refuse(422, SPAM_CHECK_FAILED, cors)
        }
      } catch (error) {
        if (error instanceof TurnstileUnavailableError) {
          console.error(`[bearminion] ${error.message}`, error.cause ?? '')
          return refuse(502, SPAM_CHECK_UNAVAILABLE, cors)
        }
        throw error
      }
    }

    const context: FormContext = {
      env,
      request: new Request(request.url, { method: request.method, headers: request.headers }),
      dev: run.dev === true,
    }
    let outcome: FormHandlerResult
    try {
      outcome = await handler(submission, context)
    } catch (error) {
      if (isFormError(error)) {
        return reply(
          error.status,
          error.fieldErrors ? { ok: false, error: error.message, fieldErrors: error.fieldErrors } : { ok: false, error: error.message },
          cors,
        )
      }
      // Whatever the outside service said stays in the log. The visitor gets a plain sentence.
      // The message goes in as text: some hosts (Cloudflare Workers) print an Error object as its stack lines only, and the
      // cause is the one thing the owner needs from this log.
      console.error('[bearminion] The form handler failed:', error instanceof Error ? `${error.name}: ${error.message}` : error)
      return refuse(502, UNDELIVERED, cors)
    }

    if (outcome === undefined) return reply(200, { ok: true }, cors)
    if (typeof outcome === 'object' && outcome !== null && outcome.ok === true) {
      const message = typeof outcome.message === 'string' && outcome.message.trim() !== '' ? outcome.message.trim() : undefined
      return reply(200, message ? { ok: true, message } : { ok: true }, cors)
    }
    if (
      typeof outcome === 'object' &&
      outcome !== null &&
      outcome.ok === false &&
      typeof outcome.error === 'string' &&
      outcome.error !== ''
    ) {
      const fieldErrors = outcome.fieldErrors && Object.keys(outcome.fieldErrors).length > 0 ? outcome.fieldErrors : undefined
      return reply(
        fieldErrors ? 422 : 400,
        fieldErrors ? { ok: false, error: outcome.error, fieldErrors } : { ok: false, error: outcome.error },
        cors,
      )
    }
    console.error('[bearminion] The form handler returned something else than nothing, { ok: true } or { ok: false, error }:', outcome)
    return refuse(500, NOT_SET_UP, cors)
  }

  return {
    async fetch(request, env = {}, run = {}) {
      const seen = { formId: '' }
      const response = await answer(request, env, run, seen)
      if (!isNavigation(request)) return response
      // Without JavaScript the visitor would read raw JSON. Send them back to the page, to the block that says what happened.
      const back = cameFrom(request)
      if (back === null) return response
      const fragment = seen.formId ? `#${seen.formId}-${response.status === 200 ? 'sent' : 'failed'}` : ''
      return new Response(null, { status: 303, headers: { location: `${back}${fragment}`, 'cache-control': 'no-store' } })
    },
  }
}
