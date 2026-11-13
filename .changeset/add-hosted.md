---
'bearminion': minor
'create-bearminion': minor
---

`npx bearminion add hosted` sets a site up for the hosted editor.

- Writes the starter files the editor depends on (`src/lib/editing.ts`, `image-url.ts`, `env.d.ts`, the image components, `Seo.astro`, the page routes, and the Media and Logo strip sections when the site has them), `src/editor.ts`, and `astro.editor.config.ts`, the build of the editor deployment. It adds a `build:editor` script to `package.json` without reformatting it, notes everything in `bearminion.lock.json`, and prints the GitHub App and Vercel checklist. `--dry-run`, `--yes`, `--overwrite`, `--install`, `--diff` and `--json` work as for sections.
- Never edits `astro.config.ts`. The editor build merges the site's config with the adapter and `bearminionHostedEditor`, so the public build cannot load editor code. Vercel only for now.
- `status` and `add` now recognise the files of every release back to 1.0, not only 1.9 and later. A site made before 1.9 and without a lock file used to see its untouched files reported as `differs`; they are now `outdated` and `add` replaces them. `Seo.astro`, `env.d.ts` and the page routes are tracked as well, so `add hosted` can tell an old copy from one you changed.
- Sites that already run the hosted editor with an environment-variable gate in `astro.config.ts` keep working and are left as they are.
