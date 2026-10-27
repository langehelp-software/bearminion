---
'bearminion': patch
'create-bearminion': patch
---

The Vercel function that `npx bearminion add form resend --host vercel` writes now imports the handler as `../src/forms/contact.js`. Vercel runs the function as an ES module, which does not guess file extensions, so the extensionless import failed with `ERR_MODULE_NOT_FOUND`. A site that already has the old `api/contact.ts` needs the same one-word change, or `npx bearminion add form resend --host vercel --overwrite`.
