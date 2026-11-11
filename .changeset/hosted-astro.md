---
'bearminion': minor
'create-bearminion': minor
---

Add `bearminionHostedEditor` to `bearminion/astro` (experimental): turns a second deployment of your site into the hosted editor. It switches to server output, signs people in, and draws each page from the repository's current content with the editor overlay on top, while the public site stays a static build with no editor code. The default template's pages read `Astro.locals.bearminion` when it is set. `bearminion/hosted` also gains `createStoreContent`, `createHostedMiddleware` and `HostedEditor.scope`.
