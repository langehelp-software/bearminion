/**
 * What a Contact form sends and what it expects back, for anyone who writes the handler behind it (a Vercel,
 * Netlify or Cloudflare function, or a plain Astro endpoint). Types only: nothing here runs in the browser.
 *
 * To run code of your own behind the form, with your keys kept on the server, use `defineForm` from `bearminion/forms`.
 *
 * ```ts
 * import type { FormResult, FormSubmission } from 'bearminion'
 *
 * export async function handle(submission: FormSubmission): Promise<FormResult> {
 *   // ...send it somewhere
 *   return { ok: true }
 * }
 * ```
 */

/**
 * The request. The form's fields by name (`name`, `email`, `topic` when the section lists topics, and `message`),
 * plus where it came from. The form posts it to `/api/contact` as a JSON object. The spam trap field is never part of it.
 */
export interface FormSubmission {
  /** The id of the Contact section that sent it. */
  formId: string
  /** The path of the page the form is on, such as `/contact`. */
  page: string
  [field: string]: string
}

/** Field name → what is wrong with it. Shown under that field on the page. */
export type FormFieldErrors = Readonly<Record<string, string>>

/**
 * The answer. `{ ok: true }` with a 2xx status shows the thank-you message; an optional `message` (plain text) is shown
 * in its place. `{ ok: false }` needs a matching 4xx or 5xx status; `error` is shown in a message the visitor closes
 * themselves, and `fieldErrors` under the fields they name.
 */
export type FormResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: FormFieldErrors }

/** The spam-trap field. People never see it; many bots fill every field they find. Formspree uses the same name. */
export const HONEYPOT_FIELD = '_gotcha'

/** The field Cloudflare Turnstile's widget fills with its token. The form sends it; `defineForm` checks and removes it. */
export const TURNSTILE_FIELD = 'cf-turnstile-response'
