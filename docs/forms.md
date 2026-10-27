---
title: Forms
description: "How the Contact form sends a message: one file in src/forms, your keys in the environment, Cloudflare Turnstile, and the glue for your host."
---

A contact form that answers "Message sent." when it sent nothing is worse than having no form. The Contact section never does that. The site stays a static build: the template has no server, no database and no token in it. What receives the message is code you write, in one file, with its keys in the environment.

## How it fits together

The Contact form always posts to **`/api/contact`** on your own site. Nothing in the content files or the editor can point it elsewhere, and no key is stored in the repository. Three parts make it work:

| Part | Where it lives | What it is |
| --- | --- | --- |
| The handler | `src/forms/contact.ts` | Your code: sends the email, posts to Slack, forwards to a form service. Written with `defineForm` |
| The glue | `api/contact.ts` (Vercel), `netlify/functions/contact.mts`, `functions/api/contact.ts` (Cloudflare) or an Astro endpoint | A few lines that hand the request to the handler and pass in the host's environment |
| The secrets | The host's environment variables, and `.env` on your machine | API keys, the Turnstile secret key, and the public Turnstile site key |

While a Contact section exists and `src/forms/contact.ts` does not, `astro dev` and `astro build` print a warning that says so, the section's settings in the editor show the same warning, and a visitor who sends the form gets an error message. Nothing is faked.

When the file exists, the section's settings say that the form is handled by your own code and that BearMinion cannot check it: send a test message from the live site and see that it arrives.

## Set up the form

You need three things: the handler file, a few lines of glue for your host, and the secrets in the host's settings.

### The quick way

For Resend on Vercel, one command writes the handler and the glue:

```sh
npx bearminion add form resend --host vercel
```

> **Set the two addresses before you deploy.** The handler reads them from the environment, so they are not in your repository: `CONTACT_FROM` is the sender, an address on a domain you verified with Resend, and `CONTACT_TO` is the inbox that receives the messages. Until both are set the form refuses to send and the visitor sees the error toast.

The command prints the three values to set, `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO`, in the host's settings and in `.env` for `astro dev`. It never replaces a handler you wrote unless you pass `--overwrite`. Other services and hosts are not in the command yet: the files for them are below, to copy by hand. See [The command line](cli.md#add-a-form-handler). The steps below show what it writes.

### 1. The handler

Create `src/forms/contact.ts`. The Contact form posts to `/api/contact`, and this file answers there.

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

That is the whole job. `submission` is the message the form sent. `env` holds your secrets. Return nothing and the visitor sees the thank-you text; throw and they see an error. [What the handler can return](#what-the-handler-returns) lists every case, and [Send the message by email](#send-the-message-by-email) has complete files for Resend and Postmark.

`bearminion/forms` uses only the web's `Request` and `Response`, so the same file runs on Vercel, Netlify, Cloudflare and in an Astro endpoint. Never import it into code that runs in the browser.

### 2. The glue for your host

Each host needs a tiny file that hands the request to your handler and passes in the host's environment. Pick yours.

**Vercel.** `api/contact.ts` at the project root:

```ts
// The ".js" is needed: Vercel runs this as an ES module, which does not guess file extensions. The file is contact.ts.
import form from '../src/forms/contact.js'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
```

**Netlify.** `netlify/functions/contact.mts`:

```ts
import type { Config } from '@netlify/functions'
import form from '../../src/forms/contact'

export default (request: Request) => form.fetch(request, process.env)

export const config: Config = { path: '/api/contact' }
```

**Cloudflare Pages.** `functions/api/contact.ts`:

```ts
import form from '../../src/forms/contact'

export const onRequest: PagesFunction<Record<string, string>> = ({ request, env }) => form.fetch(request, env)
```

**An Astro endpoint**, for a site that already runs a server build with the Node adapter. `src/pages/api/contact.ts`:

```ts
import type { APIRoute } from 'astro'
import form from '../../forms/contact'

export const prerender = false

export const ALL: APIRoute = ({ request }) => form.fetch(request, process.env)
```

> **Don't poke the bear:** `prerender = false` and an adapter turn the static build into a server build tied to one host. That is a server build on purpose. A route file without an adapter makes a static build fail, which is why the template ships none. If you use this, set `forms: false` in the `bearminion()` options so `astro dev` runs your real endpoint instead of the dev route below.

### 3. The secrets

Put each key in your host's settings, never in a content file and never in the repository:

| Host | Where |
| --- | --- |
| Vercel | Project → Settings → Environment Variables |
| Netlify | Site configuration → Environment variables (scope: Functions) |
| Cloudflare Pages | Settings → Variables and Secrets |

Redeploy after you change one. For `astro dev`, put the same names in a `.env` file at the project root: copy the starter's `.env.example`, which lists the ones the form uses. The starter's `.gitignore` keeps `.env` out of git and `.env.example` in.

One value is not secret and is read by the build, not by the function: `PUBLIC_TURNSTILE_SITE_KEY` (see [Turnstile](#cloudflare-turnstile)). Set it where the site is built, and change it with a new build.

### 4. Try it on your machine

While `astro dev` runs, the file in `src/forms` answers at `/api/<name>` on the dev server, so the form on your page works before you deploy anything.

- **Dry run, the default.** The dev route receives the message, prints it in the terminal, and answers success. Your handler is **not** called, so editing a page never sends a real email.
- **Live.** To run your handler for real, put `BEARMINION_FORMS_LIVE=on` in `.env.local`, or set it in the shell for one run. Your `.env` values are passed to the handler as `env`, and `dev` is `true`.

The dev route needs no glue file. It only exists in `astro dev`: a built site never contains it, so you still need the glue for your host before publishing.

### Use a form service

A form service (Formspree, Web3Forms, Basin) is a handler that forwards the message. The browser never sees the service's address or key, and you can switch services by editing one file.

**Formspree.** Keep the form's address in the environment as `FORMSPREE_URL` (`https://formspree.io/f/<form id>`):

```ts
import { defineForm } from 'bearminion/forms'

export default defineForm(async (submission, { env }) => {
  const response = await fetch(env.FORMSPREE_URL ?? '', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  })
  if (!response.ok) throw new Error(`Formspree answered ${response.status}`)
})
```

**Web3Forms.** Keep the access key as `WEB3FORMS_KEY`:

```ts
import { defineForm } from 'bearminion/forms'

export default defineForm(async (submission, { env }) => {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...submission, access_key: env.WEB3FORMS_KEY }),
  })
  const answer = (await response.json().catch(() => ({}))) as { success?: boolean }
  if (!response.ok || answer.success === false) throw new Error(`Web3Forms answered ${response.status}`)
})
```

**Basin** and others follow the same shape: post to the service with `fetch`, and `throw` when it does not answer with a success. The visitor sees the calm "could not be delivered" sentence and your log has the cause.

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

It does **not** check the fields. The Contact form already requires a name, a valid email and a message in the browser, and checking again on the server would be a second copy of the same rule. The catch is that a script can post to the endpoint without going through the form. If a wrong value would do harm (you let `topic` pick the recipient, or you put `name` in a mail header), check it in the handler. `oneLine` in the recipes below is the minimum for anything that goes into a header.

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
| `turnstile` | off | `true` checks a Turnstile token with the secret key in `TURNSTILE_SECRET_KEY`. `{ secretEnv: 'MY_VAR' }` names another variable. See [Turnstile](#cloudflare-turnstile) |
| `origins` | none | Other websites allowed to post here, such as `https://www.example.com`, or `'*'` for any. The form's own site is always allowed. Needed only when the page and the function live at different addresses |
| `maxBytes` | `65536` | The largest post accepted |

A browser page always sends an `Origin` header, and `defineForm` compares its host with the address of the function. If your host rewrites the host name on the way to the function, every post gets 403: list your site in `origins`.

## Send the message by email

The handler sends the mail, not the browser: the key stays on the server, and deliverability and abuse limits belong to your account at the provider. Collapse the visitor's name to one line before it goes into a subject, as `oneLine` does. A name with a line break in it is how mail headers get forged.

**Resend.** `src/forms/contact.ts`. This is the file `add form resend` writes. It has been tried on Vercel; the others below have not been sent through the live service.

```ts
import { defineForm } from 'bearminion/forms'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export default defineForm(async (submission, { env }) => {
  // Both addresses live in the environment, so they are not in the repository. CONTACT_FROM has to be on a domain you
  // verified with Resend; CONTACT_TO is where the messages arrive.
  if (!env.CONTACT_FROM || !env.CONTACT_TO) throw new Error('Set CONTACT_FROM and CONTACT_TO in the environment.')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      reply_to: submission.email,
      subject: `New message from ${oneLine(submission.name ?? '')}`,
      text: `${submission.message}\n\nFrom: ${submission.name} <${submission.email}>\nTopic: ${submission.topic ?? '-'}\nPage: ${submission.page}`,
    }),
  })
  if (!response.ok) throw new Error(`Resend answered ${response.status}`)
})
```

> **Set `CONTACT_FROM` and `CONTACT_TO` before you deploy.** The handler refuses to send until both are set, and keeping them in the environment keeps your addresses out of the repository. `CONTACT_FROM` has to be an address on a domain you verified with Resend, or Resend rejects the message. While you test with no verified domain, Resend only accepts `onboarding@resend.dev` as the sender and only delivers to the address of your own Resend account.

Set `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO` in the host.

**Postmark.** The same file with Postmark's request:

```ts
const response = await fetch('https://api.postmarkapp.com/email', {
  method: 'POST',
  headers: { 'X-Postmark-Server-Token': env.POSTMARK_TOKEN ?? '', Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    From: 'contact@your-domain.example',
    To: 'you@your-domain.example',
    ReplyTo: submission.email,
    Subject: `New message from ${oneLine(submission.name ?? '')}`,
    TextBody: submission.message,
    MessageStream: 'outbound',
  }),
})
if (!response.ok) throw new Error(`Postmark answered ${response.status}`)
```

**A Slack channel.** Make an incoming webhook in Slack and keep its address as a secret, because anyone who has it can post to your channel:

```ts
import { defineForm } from 'bearminion/forms'

export default defineForm(async (submission, { env }) => {
  const response = await fetch(env.SLACK_WEBHOOK_URL ?? '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${submission.name}* <${submission.email}>\n${submission.message}` }),
  })
  if (!response.ok) throw new Error(`Slack answered ${response.status}`)
})
```

To do two things, call both in the handler. If you want the visitor to see success when only one of them worked, catch the other and log it.

## Keep spam out

Two checks run in the browser, with no service and no cookie:

- **A trap field.** The form has an input named `_gotcha`, out of sight, out of the tab order and hidden from screen readers. People never fill it; many bots fill every field. A filled trap is dropped, looks like a success to the sender, and is never sent. `defineForm` drops it on the server too, which catches a bot that posts the form without running the page's script.
- **A minimum time.** A submit less than 1.5 seconds after the form appeared is dropped the same way. Nobody types a message that fast.

These stop the crude ones. For more, add Turnstile, and let your host rate-limit.

### Cloudflare Turnstile

Turnstile is Cloudflare's free check for "is this a person". The visitor sees a small widget (usually it passes on its own), the page gets a token, and your function asks Cloudflare whether the token is genuine. You do not need your site on Cloudflare.

1. In the Cloudflare dashboard open **Turnstile**, add a widget for your domain, and copy its **site key** and **secret key**.
2. Set the site key as `PUBLIC_TURNSTILE_SITE_KEY` where the site is built (the host's settings, and `.env` for `astro dev`). Astro puts it into the page at build time, so a change needs a new build. This key is public by design: it ends up in the page, and it is not stored in the content files. With it, the widget appears above the send button; without it there is no widget.
3. Put the secret key in the host's settings (and in `.env` for local use) as `TURNSTILE_SECRET_KEY`. This one stays on the server.
4. Turn the check on in the handler:

```ts
export default defineForm(handler, { turnstile: true })
```

Set both keys, or neither: a handler that asks for a token while the page has no site key refuses every message. From then on a message without a genuine token is refused with 422 ("The spam check did not pass. Reload the page and try again.") and your handler never runs.

| What happens | The visitor sees |
| --- | --- |
| Sends before the widget has a token | "The spam check is still running. Try again in a moment." Nothing is sent |
| The widget's script is blocked, or the widget reports an error | "The spam check could not run. Reload the page, turn off any blocker for this site, and try again." Nothing is sent |
| The token is refused | "The spam check did not pass. Reload the page and try again." (422) |
| Cloudflare cannot be reached from your function | "The spam check could not be completed. Try again in a moment." (502) |
| The secret key is missing or wrong | "This form is not set up correctly. Please try again later." (500) and the server log names the variable |

A token works once, so after every send the page asks the widget for a new one.

**Testing.** Cloudflare publishes keys that always give the same answer. Site key `1x00000000000000000000AA` always passes, `2x00000000000000000000AB` always fails. Their secret keys are `1x0000000000000000000000000000000AA` (accepts) and `2x0000000000000000000000000000000AA` (rejects). A dummy site key only works with a dummy secret key. Use real ones in production.

**Privacy.** The widget loads `challenges.cloudflare.com/turnstile/v0/api.js` and talks to Cloudflare, so say so in your privacy policy. It loads only on pages that have a Contact section, and only while `PUBLIC_TURNSTILE_SITE_KEY` is set. Without JavaScript the widget cannot run, and a form that needs a token cannot be sent.

### Rate limiting

Limiting how often one visitor can send is the host's job: use Vercel Firewall, Cloudflare rate limiting rules or Netlify's edge tools rather than a counter in code. A function that scales to zero forgets any counter you keep in memory.

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

## While you build

- `astro dev` and `astro build` print a warning for each Contact section while `src/forms/contact.ts` does not exist. It is a warning, not an error, so a new site still starts and builds.
- The section's settings in the editor show the same warning, or, once the file exists, a note that your own code handles the form and has to be tested by hand. The check looks for the file only. It cannot know whether your keys, your service or your host are set up.
- In **Preview** the form behaves as it will on the live site, including the 1.5 second wait and the error message. Send one to see the thank-you text.
- `src/forms/<name>.ts` answers at `/api/<name>` on the dev server. Edits to the file apply on the next send, with no restart. Change the folder or the path with `forms: { dir: 'server/forms', prefix: '/hooks' }` in the `bearminion()` options, or turn the route off with `forms: false`.

## Stop a build that has no handler

By default a Contact form with no `src/forms/contact.ts` is a warning, so a new site still builds. For a production deploy that should not go out with a form nobody answers, set `BEARMINION_FORMS=required` in the host's **build** environment. The build then fails and names the form. Do not put it in `.env`: `astro dev` and new sites stay as they are.

This checks that the handler file exists. It cannot check that the host has the glue file or that the secrets are set, so send one message from the live site after a deploy. `BEARMINION_FORMS_LIVE` is a different switch: it only decides whether `astro dev` runs your handler or prints a dry run, and a built site never reads it.

## When it does not work

| You see | Cause and fix |
| --- | --- |
| The page says "The message was not accepted" and the network tab shows 404 | The host has no function at `/api/contact` yet. Add the glue file for your host and redeploy. `astro dev` serves the handler, a built site does not |
| A warning that `src/forms/contact.ts` does not exist | Create it (see [Set up the form](#set-up-the-form)). Until then visitors get an error when they send the form |
| No Turnstile widget on the page | `PUBLIC_TURNSTILE_SITE_KEY` was not set when the site was built (or when `astro dev` started). Set it and rebuild |
| 403 "This site is not allowed to send to this form." | The post came from an address other than the function's. List your site in `origins`, or check that your host passes the original host name on |
| 405 or 415 | Something other than a form posted to it, or a body that is not JSON or form data |
| 413 | Over 64 KB. Raise `maxBytes` if the form really sends that much |
| "This form is not set up correctly." | The server log has the reason: `TURNSTILE_SECRET_KEY` missing, Turnstile refusing the secret, or a handler that returned something it should not |
| "The message could not be delivered." | Your handler threw. The log has the error that was thrown |
| In `astro dev` the handler never runs | The route is a dry run until `BEARMINION_FORMS_LIVE=on`. The terminal says so each time |
| In `astro dev` the route does nothing | The file is not in `src/forms`, its name has characters other than letters, digits, `-` and `_`, or it does not `export default defineForm(...)` (the terminal names the file) |

## In the content file

The Contact section keeps no form settings. Its props are the text on the page: `eyebrow`, `heading`, `body`, `details`, `topics`, `note` and `thanks`. See [Contact section](sections/contact.md).

Sites made before this change may have `action`, `format` or `turnstile` in a Contact section. Content version 3 removes them: they are dropped from the file the next time it is saved in the editor. Before you save, copy a form service's address into a handler as shown in [Use a form service](#use-a-form-service), and the site key into `PUBLIC_TURNSTILE_SITE_KEY`.

With JavaScript turned off, the browser posts the form to `/api/contact` itself. `defineForm` sees a browser asking for a page (not the script asking for JSON) and answers with a redirect back to the page the visitor came from, to `#<section id>-sent` (the "Message sent." block replaces the form) or `#<section id>-failed` (a short "not sent" line under the form). A request without a same-site `Referer` still gets the JSON answer, so the redirect can never lead to another site. Without the script there is no sending state, no field errors, no text from your handler (the sent block shows the section's thank-you text) and no Turnstile widget, so a form that checks Turnstile always lands on the failed block.

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
