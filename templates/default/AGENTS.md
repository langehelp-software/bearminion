# Working in this BearMinion site

For an AI assistant helping the person who owns this site. The first rule is about secrets; read it before touching anything that has a key in it.

## Secrets: never see them, never write them down

- **Never ask the person to paste a key, token, password or webhook URL into the chat.** If one appears anyway, do not repeat it, do not put it in any file, and tell them to revoke it at the service and create a new one. A key that was typed into a chat is no longer private.
- **Do not open `.env` or any `.env.*` file** (`.env.example` is fine: it holds names only). Do not `cat`, `grep` or print them, and do not print the environment. To learn whether a name is set locally, run `npx bearminion check form`: it reports names, never values.
- **Never write a secret value into a file that git tracks:** `src/`, `wrangler.jsonc` (including `vars`), `netlify.toml`, `vercel.json`, `.env.example`, a README, a commit message, a log. The person types the value into the place where it belongs, not you.
- **Where a secret goes:** the host's dashboard settings (Vercel and Netlify: Environment Variables; Cloudflare: the Worker's Settings, as a Secret), and `.env` for `astro dev`. A host's command line is fine only when it asks for the value at a prompt (`npx wrangler secret put NAME`, `vercel env add NAME`), never as an argument, which lands in shell history.
- **What counts as a secret:** `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, anything ending in `_KEY`, `_SECRET` or `_TOKEN`, and webhook URLs. Never give one a `PUBLIC_` prefix: Astro writes `PUBLIC_` values into the built page for everyone to read. The Turnstile site key (`PUBLIC_TURNSTILE_SITE_KEY`) is the one public value here.
- **Addresses are not secrets, but they are public in a public repository.** `CONTACT_FROM` and `CONTACT_TO` live under `vars` in `wrangler.jsonc` on Cloudflare. Ask whether the repository is private before putting real addresses there.
- Before every commit, check `git status` and `git diff --staged` for a `.env` file or a value that looks like a key.

## Setting up the Contact form

Do these in order. Work from the command line, and never say the form works until the person tells you a real message arrived.

1. **Ask first:** where the site runs (Vercel, Netlify or Cloudflare Workers) and which service sends the message. `npx bearminion add form --list` shows what the command writes. Today that is `resend`; other services in the [Forms guide](https://docs.bearminion.com/forms) are untested examples.
2. **Write the files:** `npx bearminion add form resend --host <host> --dry-run`, then without `--dry-run`. A file the person changed is not replaced unless they agree to `--overwrite`.
3. **Check the files:** `npx bearminion check form --host <host>`. It reads the project and writes nothing. Fix each problem it names and run it again until none is left.
4. **Ask about everything you cannot see.** The check cannot read the host's settings or the service's account. Ask these one at a time, wait for a yes to each, and do not skip one because it is probably done:
   - The Resend account exists, an API key was created, and the domain behind `CONTACT_FROM` is verified. Until then Resend sends only from `onboarding@resend.dev` and only to the account owner.
   - `RESEND_API_KEY`, `CONTACT_FROM` and `CONTACT_TO` are set on the host. On Vercel and Netlify: in Environment Variables, for Production and Preview. On Cloudflare: the key as a Secret, the two addresses under `vars` in `wrangler.jsonc`.
   - The site was deployed again after they were set. A new value reaches only a new deploy.
   - Turnstile, if they use it: `PUBLIC_TURNSTILE_SITE_KEY` was set where the site is built, and `TURNSTILE_SECRET_KEY` on the server. Both or neither; with the secret alone every message is refused.
   - A message sent from the deployed site arrived in the inbox (look in spam too).
5. **When it fails,** ask for the error line from the host's function log (not the environment), and read the table in the Forms guide's Troubleshooting page. Most failures are a variable that is missing on the host, a deploy that did not happen after setting it, or an import without `.js`.

## Other work on this site

- Content lives in `content/` and is edited in the dev editor (`npm run dev`). Sections are in `src/components/sections`; `npx bearminion add <section>` adds one and `npx bearminion status` shows what is out of date.
- Run `npm run build` before saying a change is done.
- Guides: https://docs.bearminion.com
