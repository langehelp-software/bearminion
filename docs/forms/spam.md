---
title: Spam checks
description: "The trap field and the minimum time every form has, Cloudflare Turnstile, and rate limiting."
---

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
4. That is all. `defineForm` checks the token whenever `TURNSTILE_SECRET_KEY` is in the environment, with no option in the handler. To make the check required, so that a missing secret refuses every message with an error instead of skipping the check, or to turn it off:

```ts
export default defineForm(handler, { turnstile: true }) // required
export default defineForm(handler, { turnstile: false }) // never
```

Set both keys, or neither: a secret key with no site key at build time refuses every message, because the page has no widget to give a token. From then on a message without a genuine token is refused with 422 ("The spam check did not pass. Reload the page and try again.") and your handler never runs.

| What happens | The visitor sees |
| --- | --- |
| Sends before the widget has a token | "The spam check is still running. Try again in a moment." Nothing is sent |
| The widget's script is blocked, or the widget reports an error | "The spam check could not run. Reload the page, turn off any blocker for this site, and try again." Nothing is sent |
| The token is refused | "The spam check did not pass. Reload the page and try again." (422) |
| Cloudflare cannot be reached from your function | "The spam check could not be completed. Try again in a moment." (502) |
| The secret key is missing or wrong | "This form is not set up correctly. Please try again later." (500) and the server log names the variable |

A token works once, so after every send the page asks the widget for a new one.

**Where the widget ran.** Cloudflare says which host served the widget. `defineForm` accepts the token only when that is the host the function runs on, so a token that was solved on another site is refused with the same 422, and the server log names both hosts. If your page and your function sit on different hosts, list the page's host:

```ts
export default defineForm(handler, { turnstile: { hostnames: ['www.example.com'] } })
```

Cloudflare's test secrets are exempt from this check.

**What it does not stop.** A person, or a service that pays people to solve challenges, gets real tokens and can send. Turnstile makes that costly, not impossible. Add the host's rate limiting (below), and keep your email provider's own limits on.

**Testing.** Cloudflare publishes keys that always give the same answer. Site key `1x00000000000000000000AA` always passes, `2x00000000000000000000AB` always fails. Their secret keys are `1x0000000000000000000000000000000AA` (accepts) and `2x0000000000000000000000000000000AA` (rejects). A dummy site key only works with a dummy secret key. Use real ones in production.

**Privacy.** The widget loads `challenges.cloudflare.com/turnstile/v0/api.js` and talks to Cloudflare, so say so in your privacy policy. It loads only on pages that have a Contact section, and only while `PUBLIC_TURNSTILE_SITE_KEY` is set. Without JavaScript the widget cannot run, and a form that needs a token cannot be sent.

### Rate limiting

Limiting how often one visitor can send is the host's job: use Vercel Firewall, Cloudflare rate limiting rules or Netlify's edge tools rather than a counter in code. A function that scales to zero forgets any counter you keep in memory.
