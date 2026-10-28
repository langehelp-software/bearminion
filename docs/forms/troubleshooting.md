---
title: Troubleshooting
description: "What the editor and the build tell you while you set a form up, how to stop a build that has no handler, and what each error means."
---

## While you build

- `astro dev` and `astro build` print a warning for each Contact section while `src/forms/contact.ts` does not exist. It is a warning, not an error, so a new site still starts and builds.
- The section's settings in the editor show the same warning, or, once the file exists, a note that your own code handles the form and has to be tested by hand. The check looks for the file only. It cannot know whether your keys, your service or your host are set up.
- In **Preview** the form behaves as it will on the live site, including the 1.5 second wait and the error message. Send one to see the thank-you text.
- `src/forms/<name>.ts` answers at `/api/<name>` on the dev server. Edits to the file apply on the next send, with no restart. Change the folder or the path with `forms: { dir: 'server/forms', prefix: '/hooks' }` in the `bearminion()` options, or turn the route off with `forms: false`.

## Stop a build that has no handler

By default a Contact form with no `src/forms/contact.ts` is a warning, so a new site still builds. For a production deploy that should not go out with a form nobody answers, set `BEARMINION_FORMS=required` in the host's **build** environment. The build then fails and names the form. Do not put it in `.env`: `astro dev` and new sites stay as they are.

This checks that the handler file exists. It cannot check that the host has the glue file or that the secrets are set, so send one message from the live site after a deploy. `BEARMINION_FORMS_LIVE` is a different switch: it only decides whether `astro dev` runs your handler or prints a dry run, and a built site never reads it.

## When it does not work

Run `npx bearminion check form` first: it reads your files and names what is missing, with the fix (see [Check the form](../cli.md#check-the-form)). It cannot see the host's settings.

| You see | Cause and fix |
| --- | --- |
| The page says "The message was not accepted" and the network tab shows 404 | The host has no function at `/api/contact` yet. Add the glue file for your host and redeploy. `astro dev` serves the handler, a built site does not |
| A warning that `src/forms/contact.ts` does not exist | Create it (see [The quick way](README.md#the-quick-way)). Until then visitors get an error when they send the form |
| No Turnstile widget on the page | `PUBLIC_TURNSTILE_SITE_KEY` was not set when the site was built (or when `astro dev` started). Set it and rebuild. On Cloudflare it has to be a Build variable; under `vars` in `wrangler.jsonc` it only reaches the running Worker. `curl -s <your site> \| grep -o 'data-turnstile-key="[^"]*"'` shows whether the key is in the page |
| 403 "This site is not allowed to send to this form." | The post came from an address other than the function's. List your site in `origins`, or check that your host passes the original host name on |
| 405 or 415 | Something other than a form posted to it, or a body that is not JSON or form data |
| 413 | Over 64 KB. Raise `maxBytes` if the form really sends that much |
| "This form is not set up correctly." | The server log has the reason: `TURNSTILE_SECRET_KEY` missing, Turnstile refusing the secret, or a handler that returned something it should not |
| "The spam check did not pass." for every visitor, and the log says the widget was served on another host | The page and the function are on different hosts. List the page's host in `turnstile: { hostnames: [...] }` (see [Turnstile](spam.md#cloudflare-turnstile)) |
| "The message could not be delivered." | Your handler threw. The log has the error that was thrown |
| In `astro dev` the handler never runs | The route is a dry run until `BEARMINION_FORMS_LIVE=on`. The terminal says so each time |
| In `astro dev` the route does nothing | The file is not in `src/forms`, its name has characters other than letters, digits, `-` and `_`, or it does not `export default defineForm(...)` (the terminal names the file) |

## Older sites, and no JavaScript

The Contact section keeps no form settings. Its props are the text on the page: `eyebrow`, `heading`, `body`, `details`, `topics`, `note` and `thanks`. See [Contact section](../sections/contact.md).

Sites made before this change may have `action`, `format` or `turnstile` in a Contact section. Content version 3 removes them: they are dropped from the file the next time it is saved in the editor. Before you save, copy a form service's address into a handler as shown in [Use a form service](email.md#use-a-form-service), and the site key into `PUBLIC_TURNSTILE_SITE_KEY`.

With JavaScript turned off, the browser posts the form to `/api/contact` itself. `defineForm` sees a browser asking for a page (not the script asking for JSON) and answers with a redirect back to the page the visitor came from, to `#<section id>-sent` (the "Message sent." block replaces the form) or `#<section id>-failed` (a short "not sent" line under the form). A request without a same-site `Referer` still gets the JSON answer, so the redirect can never lead to another site. Without the script there is no sending state, no field errors, no text from your handler (the sent block shows the section's thank-you text) and no Turnstile widget, so a form that checks Turnstile always lands on the failed block.
