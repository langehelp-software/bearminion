/**
 * `bearminion/forms`: the server side of a form. Put a function of yours behind the Contact form, with your keys kept
 * on the server. Web-standard `Request` and `Response` only, so the same file runs on Vercel, Netlify, Cloudflare and
 * in an Astro endpoint. Do not import it into code that runs in the browser.
 */
export { FormError, defineForm } from './define-form.js'
export type { Form, FormContext, FormEnv, FormHandler, FormHandlerResult, FormOptions, FormRunOptions } from './define-form.js'
export { TURNSTILE_VERIFY_URL, TurnstileUnavailableError, verifyTurnstile } from './turnstile.js'
export type { TurnstileOutcome, VerifyTurnstileInput } from './turnstile.js'
export { HONEYPOT_FIELD, TURNSTILE_FIELD } from '../form-contract.js'
export type { FormFieldErrors, FormResult, FormSubmission } from '../form-contract.js'
