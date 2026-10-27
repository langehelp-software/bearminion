---
'bearminion': patch
'create-bearminion': patch
---

`npx bearminion add form resend --host netlify` and `--host cloudflare` write the Netlify Function (`netlify/functions/contact.mts`) and a Cloudflare Worker (`worker.ts`, plus a `wrangler.jsonc` when the site has no Wrangler config) next to the handler. A real message has gone through Resend on Vercel, Netlify and Cloudflare. A failed handler now logs its message as text, which Cloudflare's logs had dropped. `.env.example` no longer spells out Cloudflare's test keys, which made Netlify's secrets scan fail a build that used them, and the Forms guide says how to keep the public site key out of that scan.
