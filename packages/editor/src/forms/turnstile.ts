/**
 * Server side of Cloudflare Turnstile: the widget in the page gives the visitor a token; this asks Cloudflare whether
 * it is genuine. A token works once, so call it once per submission.
 */

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Turnstile could not be asked: Cloudflare was unreachable or answered something unreadable. */
export class TurnstileUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TurnstileUnavailableError'
  }
}

export type TurnstileOutcome =
  /** The token is genuine. `hostname` is where Cloudflare says the widget was served, when it says. */
  | { success: true; hostname?: string }
  /** `misconfigured` is true when the secret key is missing or wrong: a mistake on your side, not the visitor's. */
  | { success: false; codes: string[]; misconfigured: boolean }

export interface VerifyTurnstileInput {
  secret: string
  token: string
  /** The visitor's address. Optional; Cloudflare uses it as an extra signal. */
  remoteIp?: string
  /** For tests. Defaults to the platform's `fetch`. */
  fetch?: typeof fetch
}

/** Asks Cloudflare whether `token` is a genuine, unused Turnstile token for your secret key. */
export async function verifyTurnstile({ secret, token, remoteIp, fetch: send = fetch }: VerifyTurnstileInput): Promise<TurnstileOutcome> {
  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)
  let answer: unknown
  try {
    const response = await send(TURNSTILE_VERIFY_URL, { method: 'POST', body })
    answer = await response.json()
  } catch (error) {
    throw new TurnstileUnavailableError('Could not reach Cloudflare Turnstile.', { cause: error })
  }
  if (typeof answer !== 'object' || answer === null) throw new TurnstileUnavailableError('Turnstile answered something unreadable.')
  const record = answer as { success?: unknown; hostname?: unknown; 'error-codes'?: unknown }
  if (record.success === true)
    return typeof record.hostname === 'string' && record.hostname !== '' ? { success: true, hostname: record.hostname } : { success: true }
  const codes = Array.isArray(record['error-codes']) ? record['error-codes'].filter((code): code is string => typeof code === 'string') : []
  const misconfigured = codes.some((code) => code === 'missing-input-secret' || code === 'invalid-input-secret')
  return { success: false, codes, misconfigured }
}
