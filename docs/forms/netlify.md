---
title: Netlify
description: "The Contact form on Netlify: the command, the function file it writes, the settings, and what to check."
---

A file in `netlify/functions/` is a Netlify Function. Resend through this setup has sent a real message from Netlify.

## Add it

```sh
npx bearminion add form resend --host netlify
```

It writes `src/forms/contact.ts` (the [handler](handler.md)) and `netlify/functions/contact.mts` (the glue below). Commit both: Netlify builds from git. It prints the three values to set.

## The glue file

### `netlify/functions/contact.mts`

Hands the request to the handler, passes in Netlify's environment, and answers at `/api/contact`.

```ts
import form from '../../src/forms/contact.js'

export default (request: Request) => form.fetch(request, process.env)

export const config = { path: '/api/contact' }
```

## Settings

Under Site configuration → Environment variables, with the scope that includes Functions:

| Name | Value | Needed |
| --- | --- | --- |
| `RESEND_API_KEY` | Your Resend key | Always |
| `CONTACT_FROM` | The sender, an address on a domain you verified with Resend | Always |
| `CONTACT_TO` | The inbox that receives the messages | Always |
| `BEARMINION_FORMS` | `required`, so a build with no handler fails | Recommended |
| `SECRETS_SCAN_OMIT_KEYS` | `PUBLIC_TURNSTILE_SITE_KEY` | If you use Turnstile |

The build settings are `npm run build` and the publish directory `dist`. No `netlify.toml` is needed. Redeploy after you change a value. For `astro dev`, put the same names in `.env`; see [Try it on your machine](README.md#try-it-on-your-machine).

## Check it

1. In the deploy log, look for `1 new function(s) to upload`. `0 new function(s) to upload` means Netlify found no function: the folder is not named exactly `netlify/functions`, or the file is not committed.
2. Open `/api/contact` in the browser. A function that is there answers 405; a 404 means it was not deployed.
3. Send one message from the deployed site and see that it arrives.
4. If the form says the message was not delivered, open Logs → Functions in Netlify for the cause.

## How it works

Netlify bundles the function when it builds, so the handler and `bearminion/forms` are packed into it. `config.path` maps the function to `/api/contact`, so the page needs no redirect. The `.js` ending of the import is the form that works on every host, so all the glue files use it. There is no adapter. The site stays a static build and the function sits beside it.

Netlify scans the repository and the built site for the values of your variables and fails the build when it finds one. The Turnstile site key is public and is written into the page, so omit that one key with `SECRETS_SCAN_OMIT_KEYS`. Leave the scan on for the secret key. Do not paste Cloudflare's Turnstile test keys into your files if you also set them as variables here: the scan finds them.

## Netlify's own documentation

- [Functions overview](https://docs.netlify.com/build/functions/overview/)
- [Environment variables](https://docs.netlify.com/build/environment-variables/overview/)
- [Secret scanning](https://docs.netlify.com/manage/security/secret-scanning/)
