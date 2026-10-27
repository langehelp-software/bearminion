---
'bearminion': patch
'create-bearminion': patch
---

The Contact form's Turnstile check turns on by itself when `TURNSTILE_SECRET_KEY` is in the environment, so the widget on the page can no longer sit in front of a server that checks nothing. `turnstile: true` still requires it and `turnstile: false` turns it off. A genuine token is also refused when Cloudflare says the widget was served on a host other than the one the function runs on; `turnstile: { hostnames }` lists others. The visitor address sent to Turnstile now comes from the host's own header, or the last `x-forwarded-for` entry, not the first, which the visitor can set. A site that had the secret key set and no option now checks tokens: if its page has no site key, the form refuses every message until the site key is set.
