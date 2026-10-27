---
title: Vercel
description: "The Contact form on Vercel: the command, the function file it writes, the settings, and what to check."
---

A file in the `api/` folder is a Vercel Function. Resend through this setup has sent a real message from a Vercel preview.

## Add it

```sh
npx bearminion add form resend --host vercel
```

It writes `src/forms/contact.ts` (the [handler](handler.md)) and `api/contact.ts` (the glue below). Commit both: Vercel builds from git. It prints the three values to set.

## The glue file

### `api/contact.ts`

Hands the request to the handler and passes in Vercel's environment. The folder is `api/` at the project's root directory (in a monorepo, the app's folder).

```ts
// The ".js" is needed: Vercel runs this as an ES module, which does not guess file extensions. The file is contact.ts.
import form from '../src/forms/contact.js'

export const POST = (request: Request) => form.fetch(request, process.env)
export const OPTIONS = POST
```

## Settings

In the project's Settings → Environment Variables:

| Name | Value | Needed |
| --- | --- | --- |
| `RESEND_API_KEY` | Your Resend key | Always |
| `CONTACT_FROM` | The sender, an address on a domain you verified with Resend | Always |
| `CONTACT_TO` | The inbox that receives the messages | Always |
| `BEARMINION_FORMS` | `required`, so a build with no handler fails | Recommended |

Tick Production and Preview for each. With Preview unticked, a preview deploy refuses to send. Redeploy after you change a value. For `astro dev`, put the same names in `.env`; see [Try it on your machine](README.md#try-it-on-your-machine).

## Check it

1. After the deploy, open `/api/contact` in the browser. A function that is there refuses a plain visit; a 404 means it was not deployed, so check that `api/contact.ts` is committed and inside the project's root directory.
2. Send one message from the deployed site and see that it arrives. BearMinion cannot check your keys, your sender domain or your host.
3. If the form says the message was not delivered, open the function's log in Vercel (Logs) for the cause.

## How it works

Vercel compiles each file in `api/` on its own and runs it as an ES module, so it does not bundle the handler into it and does not guess file extensions. That is why the import ends in `.js` even though the file is `contact.ts`: without it, the function fails with `ERR_MODULE_NOT_FOUND`. The site stays a static build. There is no adapter and no `vercel.json`.

## Vercel's own documentation

- [Environment variables](https://vercel.com/docs/environment-variables)
- [Environments: Production and Preview](https://vercel.com/docs/deployments/environments)
