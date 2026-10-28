---
'bearminion': minor
'create-bearminion': minor
---

New command `npx bearminion check form`. It reads the site's files and environment and names what keeps the Contact form from working: a missing handler or glue file, an import without `.js`, a Netlify function in the wrong folder or without a path, a Wrangler config without `main`, with the placeholder name or without `CONTACT_FROM` and `CONTACT_TO` under `vars`. Each problem comes with its fix. It writes nothing and cannot see the host's own settings. `--host` and `--json` work as for `add form`.
