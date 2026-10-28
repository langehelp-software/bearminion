---
'bearminion': patch
'create-bearminion': patch
---

`npx bearminion add form <service>` now asks which host the site runs on, in a terminal, when nothing in the project names one (or two hosts do). It offers Vercel, Netlify and Cloudflare, and Enter writes the handler alone, as before. With `--host`, with `--json`, or without a terminal it does not ask.
