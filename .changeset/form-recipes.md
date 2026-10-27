---
'bearminion': minor
'create-bearminion': minor
---

`npx bearminion add form resend --host vercel` writes the Contact form's handler to `src/forms/contact.ts` and the Vercel function that runs it. It is the first form recipe sent through a real service; Formspree, Web3Forms, Postmark, Slack and the Netlify, Cloudflare and Astro glue stay in the Forms guide as files to copy until each has been tried. The handler is written with example `FROM` and `TO` addresses and refuses to send until you change them. The command never replaces a handler you wrote unless you pass `--overwrite`, and it notes the files in `bearminion.lock.json`. `BEARMINION_FORMS=required` in the host's build environment makes `astro build` fail while a Contact form has no handler. See [The command line](https://github.com/langehelp-software/bearminion/blob/main/docs/cli.md#add-a-form-handler).
