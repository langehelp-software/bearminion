---
title: Email and form services
description: "Complete handlers for Resend, Postmark, Slack, Formspree and Web3Forms. Resend is tried; the others are examples that have not been sent through the live service."
---

> **Tried and not tried.** Resend is the one handler that has sent real messages, from Vercel, Netlify and Cloudflare, and `add form resend` writes it. Postmark, Slack, Formspree and Web3Forms below are examples: written from each service's API, never sent through the live service. Expect to adjust them, and send one real message before you rely on them.

## Send the message by email

The handler sends the mail, not the browser: the key stays on the server, and deliverability and abuse limits belong to your account at the provider. Collapse the visitor's name to one line before it goes into a subject, as `oneLine` does. A name with a line break in it is how mail headers get forged.

**Resend (tried).** `src/forms/contact.ts`. This is the file `add form resend` writes. It has sent real messages from Vercel, Netlify and Cloudflare.

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

**Postmark (example, not tried).** The same file with Postmark's request:

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

**A Slack channel (example, not tried).** Make an incoming webhook in Slack and keep its address as a secret, because anyone who has it can post to your channel:

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

## Use a form service

A form service (Formspree, Web3Forms, Basin) is a handler that forwards the message. The browser never sees the service's address or key, and you can switch services by editing one file.

**Formspree (example, not tried).** Keep the form's address in the environment as `FORMSPREE_URL` (`https://formspree.io/f/<form id>`):

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

**Web3Forms (example, not tried).** Keep the access key as `WEB3FORMS_KEY`:

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

**Basin** and others (not tried either) follow the same shape: post to the service with `fetch`, and `throw` when it does not answer with a success. The visitor sees the calm "could not be delivered" sentence and your log has the cause.
