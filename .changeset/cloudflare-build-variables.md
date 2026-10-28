---
'bearminion': patch
'create-bearminion': patch
---

`check form` now says when a `PUBLIC_` value such as the Turnstile site key sits under `vars` in the Wrangler config: that reaches the running Worker only, so the page has no widget; it has to be a Build variable. The Cloudflare guide adds the Turnstile secret to its settings and says a build variable needs a new build.
