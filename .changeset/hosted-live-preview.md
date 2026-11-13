---
'bearminion': minor
'create-bearminion': minor
---

The hosted editor has live preview, and its guide is a page of its own.

- **Live preview online.** A section just added, a layout switched and header or footer changes are now redrawn at once in the hosted editor, as in `astro dev`. Before, the preview endpoints answered 501 there and such changes showed only after Save and a reload. `bearminionHostedEditor` wires the theme's `src/lib/render-preview.ts` by itself (new option `previewModule`, a path or `false`); outside Astro, pass it as `editor.handle(request, { preview })`. Sites already on the hosted editor get it by updating `bearminion` and redeploying the editor project.
- **`signIn: 'optional'` no longer answers 500 to visitors.** The starter's `[...slug].astro` reads the build's content when a server build has no props. Existing sites: `npx bearminion@latest add hosted` updates the file.
- **Docs.** New page [Edit online](https://docs.bearminion.com/hosted-editor/): what the hosted editor is, who may edit (whoever may push to the repository), the setup in five steps, pull request mode, and its limits.
- **No longer experimental on Vercel.** The hosted editor and `githubStore` are tested end to end on real Vercel deployments with a real GitHub App. Cloudflare Workers has run only in the local Workers runtime and stays experimental.
