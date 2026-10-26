import type { FormResult, FormSubmission } from 'bearminion'

/**
 * The Contact form's rules, apart from the page: what is sent, how an answer is read, and which submissions a
 * person could not have made. `components/sections/contact/form.ts` wires them to the DOM.
 */

/** The spam-trap field. People never see it; many bots fill every field they find. Formspree uses the same name. */
export const HONEYPOT_FIELD = '_gotcha'

/** The field Cloudflare Turnstile's token is sent in, which `defineForm` from `bearminion/forms` checks on the server. */
export const TURNSTILE_FIELD = 'cf-turnstile-response'

/** A person needs longer than this to type a message. A submit sooner than this after the form appeared is a script. */
export const MIN_FILL_MS = 1500

/** Why a submission is dropped without being sent, or `null` when it should go out. */
export function botVerdict(trap: string, openedAt: number, now: number): 'honeypot' | 'too-fast' | null {
  if (trap.trim() !== '') return 'honeypot'
  if (now - openedAt < MIN_FILL_MS) return 'too-fast'
  return null
}

/** The fields of a form as strings, plus where they came from. The trap field and any file input are left out. */
export function collectSubmission(entries: Iterable<[string, unknown]>, formId: string, page: string): FormSubmission {
  const submission: FormSubmission = { formId, page }
  for (const [name, value] of entries) {
    if (name === HONEYPOT_FIELD || name === 'formId' || name === 'page' || typeof value !== 'string') continue
    submission[name] = value
  }
  return submission
}

/** Where every Contact form posts. The site's own handler, `src/forms/contact.ts`, answers here. */
export const FORM_ENDPOINT = '/api/contact'

export interface FormRequest {
  url: string
  init: RequestInit
}

/** The request: the submission as JSON. The handler (`defineForm`) reads it and answers with JSON. */
export function buildRequest(submission: FormSubmission): FormRequest {
  return {
    url: FORM_ENDPOINT,
    init: {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)

/** Field errors from `fieldErrors: { email: '…' }`. */
function readFieldErrors(body: Record<string, unknown>): Record<string, string> | undefined {
  if (!isRecord(body.fieldErrors)) return undefined
  const found: Record<string, string> = {}
  for (const [name, message] of Object.entries(body.fieldErrors)) {
    const line = text(message)
    if (line) found[name] = line
  }
  return Object.keys(found).length > 0 ? found : undefined
}

/** What to tell a visitor when the endpoint gave no message of its own. */
function fallbackError(status: number): string {
  if (status === 429) return 'Too many messages in a short time. Wait a minute and try again.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return 'The message was not accepted. Check the form and try again.'
}

/**
 * Reads the handler's answer. The HTTP status decides: a 2xx is a success unless the body says `ok: false`. `body` is
 * the parsed JSON, or `undefined` when there was none, which a 2xx treats as success.
 */
export function readResponse(status: number, body: unknown): FormResult {
  const record = isRecord(body) ? body : {}
  if (status >= 200 && status < 300 && record.ok !== false) {
    const note = record.ok === true ? text(record.message) : undefined
    return note ? { ok: true, message: note } : { ok: true }
  }
  const fieldErrors = readFieldErrors(record)
  const error = text(record.error) ?? text(record.message) ?? fallbackError(status >= 200 && status < 300 ? 400 : status)
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error }
}

/** Shown when the request never got an answer: offline or blocked. */
export const NETWORK_ERROR = 'The message could not be sent. Check your connection and try again.'

/** Shown when the visitor sends before Turnstile has given its token. */
export const TURNSTILE_PENDING = 'The spam check is still running. Try again in a moment.'

/** Shown when Turnstile could not run: its script is blocked, or it reported an error. */
export const TURNSTILE_FAILED = 'The spam check could not run. Reload the page, turn off any blocker for this site, and try again.'
