---
title: Cloudflare
description: "The Contact form on Cloudflare Workers: the command, the two files it writes, the settings, and what to check."
---

This setup is a Worker that serves the built site and answers `/api/contact`. A project created as Cloudflare Pages uses a different file layout that this guide does not cover. Resend through this Worker has sent a real message.

## Add it

```sh
npx bearminion add form resend --host cloudflare
```

It writes `src/forms/contact.ts` (the [handler](handler.md)), `worker.ts` and `wrangler.jsonc` (the files below). A site that already has a Wrangler config keeps it: the command leaves `wrangler.jsonc` out and says what your config needs. Commit the files first. Without a Wrangler config, Wrangler's automatic setup edits your project on the build machine and may add an adapter. It prints the three values to set.

## The glue files

### `worker.ts`

Answers `/api/contact` with the handler and hands every other request to the built site.

```ts
import form from './src/forms/contact.js'

type Env = Record<string, string> & { ASSETS: { fetch: (request: Request) => Promise<Response> } }

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/api/contact') return form.fetch(request, env)
    return env.ASSETS.fetch(request)
  },
}
```

### `wrangler.jsonc`

Tells Cloudflare what to run, where the built site is, and turns logs on.

```jsonc
// "name" has to be the name of your Worker in Cloudflare.
// RESEND_API_KEY is a secret: set it in the Worker's Settings, not here. CONTACT_FROM and CONTACT_TO are plain values and
// live under "vars", because a deploy replaces variables that exist only in the dashboard. Fill them in, and keep this
// repository private if the addresses should not be public.
{
  "name": "my-site",
  "compatibility_date": "2026-10-27",
  "main": "./worker.ts",
  "assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/api/*"] },
  "observability": { "logs": { "enabled": true, "invocation_logs": true, "persist": true } },
  "vars": { "CONTACT_FROM": "", "CONTACT_TO": "" }
}
```

## Settings

| Name | Where | Needed |
| --- | --- | --- |
| `RESEND_API_KEY` | The Worker's Settings → Variables and Secrets, as a Secret | Always |
| `CONTACT_FROM`, `CONTACT_TO` | `vars` in `wrangler.jsonc` (a Secret in the dashboard also works) | Always |
| `BEARMINION_FORMS` | `required`, under the Worker's Build variables, so a build with no handler fails | Recommended |
| `PUBLIC_TURNSTILE_SITE_KEY` | The Worker's Build variables, not `vars` | If you use Turnstile |
| `TURNSTILE_SECRET_KEY` | The Worker's Settings → Variables and Secrets, as a Secret | If you use Turnstile (set both keys, or neither) |

The build command is `npm run build` and the deploy command `npx wrangler deploy`. For `astro dev`, put the same names in `.env`; see [Try it on your machine](README.md#try-it-on-your-machine).

## Check it

1. Open `/api/contact` in the browser. A Worker that is there answers 405; a 404 means the Worker serves only the site, so check `main` in `wrangler.jsonc`.
2. Send one message from the deployed site and see that it arrives.
3. If the form says the message was not delivered, open the Worker's logs in the Cloudflare dashboard. They are on because of `observability` in `wrangler.jsonc`; without it a failing handler leaves nothing to read.

## How it works

`run_worker_first: ["/api/*"]` makes the Worker see requests under `/api/` before the static files, so `/api/contact` reaches the handler. Every other request is answered from the built site without running the Worker, so page views do not invoke it. The `ASSETS` binding has to be named in `wrangler.jsonc`, because `worker.ts` hands any other request it receives to `env.ASSETS.fetch`. The site stays a static build. A config with `"run_worker_first": true` also works; it runs the Worker for every request.

Three things behave differently from the other hosts:

- **Plain variables come from the file.** A variable you add only in the dashboard does not survive a deploy that has a config file, and the form then refuses to send. That is why `CONTACT_FROM` and `CONTACT_TO` sit under `vars`. It puts both addresses in the repository, so keep it private if they should not be public. A dashboard variable of the type Secret does survive, if you would rather keep them out of git. `RESEND_API_KEY` is always a Secret.
- **Build variables and runtime variables are different lists.** The form reads the runtime ones (Settings, or `vars`). `BEARMINION_FORMS` and `PUBLIC_TURNSTILE_SITE_KEY` are read when the site is built, so they go under Build (Settings → Build → Variables and secrets). `vars` in `wrangler.jsonc` reach the running Worker only: a site key kept there leaves the page without the widget, as seen on a real deploy. A build variable applies to the next build, so push a commit or use Retry build after changing it; deploying an earlier build again keeps the old value.
- **The Worker's name has to match.** `name` in `wrangler.jsonc` must be the name of the Worker in Cloudflare.

## Cloudflare's own documentation

- [Static assets: configuration and bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/)
