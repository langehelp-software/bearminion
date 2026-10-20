# bearminion.com

The BearMinion website, built with BearMinion. It runs the code of the [default template](../../templates/default) with its own content, so the site always shows what the current template can do.

| Folder | What it is | In git |
| --- | --- | --- |
| `content/` | The site's pages and settings, written by the editor | yes |
| `src/assets/uploads/` | The site's images | yes |
| `astro.config.ts`, `tsconfig.json`, the rest of `src/` | Copied from `templates/default` by `scripts/sync-template.mjs` before every `dev`, `build` and `typecheck` | no |

Tailwind skips files listed in `.gitignore`, so the sync also adds an `@source` line for each copied `src/` folder to the copy of the stylesheet. Without them the site would build with most of its styles missing.

## Edit the site

```bash
pnpm web:dev
```

Open the address it prints, press Ctrl+E (Cmd+E on a Mac), edit, and press Ctrl/Cmd+S. Commit `content/` and `src/assets/uploads/`.

## Change a component or add a section

Change it in `templates/default`, never here: the copy in this folder is replaced on the next sync. A section this site needs is a new section type in the template, so every BearMinion site can use it.

To see template changes here while you work, keep the copy up to date in a second terminal:

```bash
pnpm --filter @bearminion/web sync --watch
```

## Dependencies

`package.json` lists the same dependencies as the template, without Storybook. The sync stops with a list of differences when they drift apart, for example after a dependency update in the template. To fix it:

```bash
pnpm --filter @bearminion/web sync --fix-deps
pnpm install
```
