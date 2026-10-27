---
title: The form handler
description: "What your handler receives and can return, what defineForm does around it, the options, the request contract, and the bearminion/forms reference."
---

The handler is the one file you own: `src/forms/contact.ts`. This page covers what it receives, what it can return, and what `defineForm` does around it.

## The handler

Create `src/forms/contact.ts`, or let `npx bearminion add form` write it. The Contact form posts to `/api/contact`, and this file answers there.

```ts
// src/forms/contact.ts
import { defineForm } from 'bearminion/forms'

export default defineForm(async (submission, { env }) => {
  const response = await fetch('https://api.example.com/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EXAMPLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: submission.email, text: submission.message }),
  })
  if (!response.ok) throw new Error(`The service answered ${response.status}`)
})
```

That is the whole job. `submission` is the message the form sent. `env` holds your secrets. Return nothing and the visitor sees the thank-you text; throw and they see an error. [What the handler returns](#what-the-handler-returns) lists every case, and [Email and form services](email.md) has complete files for Resend and Postmark.

`bearminion/forms` uses only the web's `Request` and `Response`, so the same file runs on Vercel, Netlify, Cloudflare and in an Astro endpoint. Never import it into code that runs in the browser.

## What the handler returns

The handler gets `(submission, context)`.

| `submission` | |
| --- | --- |
| `name`, `email`, `message` | What the visitor typed |
| `topic` | The chosen topic, when the section lists topics |
| `formId` | The section's id |
| `page` | The path of the page the form is on, such as `/contact` |

Every value is a string. Anything else in the post (a file, a number, a nested object) is left out. The spam trap field and the Turnstile token are removed before your code runs.

| `context` | |
| --- | --- |
| `env` | Your environment variables, by name |
| `request` | The incoming request without its body, for headers such as the visitor's address or language |
| `dev` | `true` while `astro dev` runs the handler |

What you do decides what the visitor sees:

| Your handler | Status | The visitor sees |
| --- | --- | --- |
| Returns nothing, or `{ ok: true }` | 200 | The thank-you text |
| Returns `{ ok: true, message: 'We will write back today.' }` | 200 | Your `message` in place of the thank-you text. Plain text only |
| Returns `{ ok: false, error: 'Closed today.' }` | 400 | A message at the bottom of the screen with `error` in it |
| Returns `{ ok: false, error, fieldErrors: { email: '…' } }` | 422 | The same message, and each field error under its field |
| Throws `new FormError('Try later.', { status: 503 })` | the status you give (default 400, or 422 with `fieldErrors`) | `Try later.` in the message |
| Throws any other error | 502 | "The message could not be delivered. Try again later." The real error goes to the server log, never to the page |
| Returns anything else | 500 | "This form is not set up correctly." and the server log says what the handler returned |

`FormError` is for refusals you want the visitor to read. An error from an outside service (Resend said 401, Slack timed out) should be a plain `throw`: the visitor gets a calm sentence and your log has the cause, including anything secret the service echoed back.

```ts
import { defineForm, FormError } from 'bearminion/forms'

export default defineForm(async (submission, { env }) => {
  if (submission.email.endsWith('@mailinator.com')) {
    throw new FormError('Use an address we can reply to.', { fieldErrors: { email: 'Not accepted.' } })
  }
  const sent = await deliver(env.API_KEY ?? '', submission)
  if (!sent) throw new Error('Delivery failed') // the visitor sees the plain 502 sentence
  return { ok: true, message: `Thanks ${submission.name}, we will write back today.` }
})
```

### What the error message looks like

Any message that is not a success appears at the bottom right of the screen and **stays until the visitor closes it** with the × button. It does not fade. Sending again replaces it. Field errors stay under their fields until the field is edited, and focus goes to the first one. After a failure the form keeps what the visitor typed, so they can fix it and send again.

## What `defineForm` does around your function

Whatever the host, before your code runs it:

- answers `POST` only, plus the CORS preflight; anything else gets 405;
- reads JSON, `multipart/form-data` and `application/x-www-form-urlencoded`; anything else gets 415, and a body it cannot read gets 400;
- refuses a post over 64 KB with 413, while the body is still arriving;
- refuses a post from another website with 403, unless you list it in `origins`;
- drops a message whose trap field is filled, answering success without calling you or Turnstile;
- checks the Turnstile token, when you turn it on.

After your code runs it turns what you returned or threw into the answer in the table above, with `Content-Type: application/json` and `Cache-Control: no-store`.

It does **not** check the fields. The Contact form already requires a name, a valid email and a message in the browser, and checking again on the server would be a second copy of the same rule. The catch is that a script can post to the endpoint without going through the form. If a wrong value would do harm (you let `topic` pick the recipient, or you put `name` in a mail header), check it in the handler. `oneLine` in the [email recipes](email.md) is the minimum for anything that goes into a header.

### Options

The second argument of `defineForm`:

```ts
export default defineForm(handler, {
  turnstile: true,
  origins: ['https://www.example.com'],
  maxBytes: 32 * 1024,
})
```

| Option | Default | Does |
| --- | --- | --- |
| `turnstile` | off | `true` checks a Turnstile token with the secret key in `TURNSTILE_SECRET_KEY`. `{ secretEnv: 'MY_VAR' }` names another variable. See [Turnstile](spam.md#cloudflare-turnstile) |
| `origins` | none | Other websites allowed to post here, such as `https://www.example.com`, or `'*'` for any. The form's own site is always allowed. Needed only when the page and the function live at different addresses |
| `maxBytes` | `65536` | The largest post accepted |

A browser page always sends an `Origin` header, and `defineForm` compares its host with the address of the function. If your host rewrites the host name on the way to the function, every post gets 403: list your site in `origins`.

## Glue for an Astro server build

A site that already runs a server build with the Node adapter can answer in an Astro endpoint instead of a host function. This is the glue for it, in `src/pages/api/contact.ts`. It has not been tried on a real deploy, and `add form` does not write it.


```ts
import type { APIRoute } from 'astro'
import form from '../../forms/contact'

export const prerender = false

export const ALL: APIRoute = ({ request }) => form.fetch(request, process.env)
```

> **Don't poke the bear:** `prerender = false` and an adapter turn the static build into a server build tied to one host. That is a server build on purpose. A route file without an adapter makes a static build fail, which is why the template ships none. If you use this, set `forms: false` in the `bearminion()` options so `astro dev` runs your real endpoint instead of the dev route below.

## What the form sends and expects

This is the contract. `defineForm` follows it exactly. You need this part only if you write the handler without `defineForm`.

**Request.** `POST` to `/api/contact` with `Accept: application/json` and `Content-Type: application/json`: one JSON object with `name`, `email`, `topic` (when the section lists topics), `message`, `formId` and `page`. The spam trap is never part of it when the page's script runs. The Turnstile token, when the page has a site key, is the field `cf-turnstile-response`.

**Answer.** The HTTP status decides:

| Status | Body | The visitor sees |
| --- | --- | --- |
| 2xx | none, or `{ "ok": true }` | The thank-you text |
| 2xx | `{ "ok": true, "message": "…" }` | `message` in place of the thank-you text |
| 2xx | `{ "ok": false, "error": "…" }` | `error` in the error message |
| 4xx, 5xx | `{ "ok": false, "error": "…", "fieldErrors": { "email": "…" } }` | `error` in the error message, each field error under its field. Focus goes to the first field that is wrong |
| 4xx, 5xx | anything else | A plain message for the status |
| no answer | the request failed (offline, blocked) | "The message could not be sent. Check your connection and try again." |

A `message` on a success only counts when the body says `"ok": true`.

The types are in the package:

```ts
import type { FormResult, FormSubmission } from 'bearminion'
```

`FormSubmission` is the request. `FormResult` is `{ ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }`.

## Reference: `bearminion/forms`

```ts
import { FormError, defineForm, verifyTurnstile } from 'bearminion/forms'
import type { Form, FormContext, FormEnv, FormHandler, FormOptions } from 'bearminion/forms'
```

| Export | |
| --- | --- |
| `defineForm(handler, options?)` | Returns a `Form` with `fetch(request, env?)`. Default-export it from `src/forms/<name>.ts` |
| `form.fetch(request, env?)` | Answers one `Request` with a `Response`. `env` is the host's environment (`process.env`, Cloudflare's `env`) |
| `FormError(message, { fieldErrors?, status? })` | Throw it to refuse a message with a text the visitor reads |
| `verifyTurnstile({ secret, token, remoteIp? })` | Asks Cloudflare whether a token is genuine. `defineForm` calls it for you; use it directly if you check tokens yourself |
| `HONEYPOT_FIELD`, `TURNSTILE_FIELD` | The field names `_gotcha` and `cf-turnstile-response` |
| Types | `FormSubmission`, `FormResult`, `FormFieldErrors`, `FormContext`, `FormEnv`, `FormHandler`, `FormHandlerResult`, `FormOptions` |

The `bearminion` package also exports the types `FormSubmission` and `FormResult`.
