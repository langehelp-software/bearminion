---
title: Forms
description: "How the Contact form sends a message: one file in src/forms, your keys in the environment, and one page for each host, plus the handler, email, spam checks and troubleshooting."
sidebar:
  order: 0
  label: Overview
---

A contact form that answers "Message sent." when it sent nothing is worse than having no form. The Contact section never does that. The site stays a static build: the template has no server, no database and no token in it. What receives the message is code you write, in one file, with its keys in the environment.

## The quick way

One command writes the handler and the glue for your host:

```sh
npx bearminion add form resend --host vercel
npx bearminion add form resend --host netlify
npx bearminion add form resend --host cloudflare
```

Run the one for your host. A real message has gone through each of them with Resend.

> **Set the two addresses before you deploy.** The handler reads them from the environment, so they are not in your repository: `CONTACT_FROM` is the sender, an address on a domain you verified with Resend, and `CONTACT_TO` is the inbox that receives the messages. Until both are set the form refuses to send and the visitor sees the error toast. On Cloudflare they go under `vars` in `wrangler.jsonc`, which does put them in the repository.

The command prints the values to set, `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO`, and never replaces a handler you wrote unless you pass `--overwrite`. Postmark, Slack, Formspree and Web3Forms are in [Email and form services](email.md) as examples to copy by hand, and have not been tried. See [The command line](../cli.md#add-a-form-handler).

## Pick your host

Each page starts with the command, then shows each file the command writes, then the settings, how to check a deploy, and how it works.

| Host | Files the command writes | Page |
| --- | --- | --- |
| Vercel | `api/contact.ts` | [Vercel](vercel.md) |
| Netlify | `netlify/functions/contact.mts` | [Netlify](netlify.md) |
| Cloudflare Workers | `worker.ts`, `wrangler.jsonc` | [Cloudflare](cloudflare.md) |

What they have in common: the site stays a static build, so none needs an adapter, a `netlify.toml` or a `vercel.json`. Commit the handler and the glue, because every host builds from git. A host without glue here, or a site that already runs a server build, can use the [Astro endpoint](handler.md#glue-for-an-astro-server-build).

| | Vercel | Netlify | Cloudflare Workers |
| --- | --- | --- | --- |
| Build | Astro is detected | `npm run build`, publish `dist` | `npm run build`, deploy `npx wrangler deploy` |
| `RESEND_API_KEY` | Environment Variables | Environment variables, scope Functions | The Worker's Settings, as a Secret |
| `CONTACT_FROM`, `CONTACT_TO` | Environment Variables | Environment variables, scope Functions | `vars` in `wrangler.jsonc` |
| Also set at build | `BEARMINION_FORMS=required` | `BEARMINION_FORMS=required`, and `SECRETS_SCAN_OMIT_KEYS=PUBLIC_TURNSTILE_SITE_KEY` if you use Turnstile | `BEARMINION_FORMS=required` under the Worker's Build variables |
| Check after a deploy | The function appears under Functions | The log says `1 new function(s) to upload` | A GET to `/api/contact` answers 405 |

The handler reads `CONTACT_FROM` and `CONTACT_TO` from the environment, so the form refuses to send until both are set. A 502 from the form with nothing else wrong usually means a missing value; the host's function log says which.

## How it fits together

The Contact form always posts to **`/api/contact`** on your own site. Nothing in the content files or the editor can point it elsewhere, and no key is stored in the repository. Three parts make it work:

| Part | Where it lives | What it is |
| --- | --- | --- |
| The handler | `src/forms/contact.ts` | Your code: sends the email, posts to Slack, forwards to a form service. Written with `defineForm` |
| The glue | `api/contact.ts` (Vercel), `netlify/functions/contact.mts` (Netlify), `worker.ts` and `wrangler.jsonc` (Cloudflare), or an Astro endpoint | A few lines that hand the request to the handler and pass in the host's environment |
| The secrets | The host's environment variables, and `.env` on your machine | API keys, the Turnstile secret key, and the public Turnstile site key |

While a Contact section exists and `src/forms/contact.ts` does not, `astro dev` and `astro build` print a warning that says so, the section's settings in the editor show the same warning, and a visitor who sends the form gets an error message. Nothing is faked.

When the file exists, the section's settings say that the form is handled by your own code and that BearMinion cannot check it: send a test message from the live site and see that it arrives.

## Try it on your machine

While `astro dev` runs, the file in `src/forms` answers at `/api/<name>` on the dev server, so the form on your page works before you deploy anything.

- **Dry run, the default.** The dev route receives the message, prints it in the terminal, and answers success. Your handler is **not** called, so editing a page never sends a real email.
- **Live.** To run your handler for real, put `BEARMINION_FORMS_LIVE=on` in `.env.local`, or set it in the shell for one run. Your `.env` values are passed to the handler as `env`, and `dev` is `true`.

The dev route needs no glue file. It only exists in `astro dev`: a built site never contains it, so you still need the glue for your host before publishing.

Put the same names the host needs in a `.env` file at the project root: copy the starter's `.env.example`, which lists the ones the form uses. The starter's `.gitignore` keeps `.env` out of git and `.env.example` in.

## The pages

- [Vercel](vercel.md), [Netlify](netlify.md) and [Cloudflare](cloudflare.md): the command, the files, the settings and how to check them
- [The form handler](handler.md): what it receives and returns, the options, and the reference
- [Email and form services](email.md): Resend, Postmark, Slack, Formspree and Web3Forms
- [Spam checks](spam.md): the trap field, Cloudflare Turnstile and rate limiting
- [Troubleshooting](troubleshooting.md): warnings, stopping a build that has no handler, and what each error means
