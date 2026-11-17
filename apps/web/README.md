# bearminion.com

The BearMinion website, built with BearMinion. It runs the code of the [default template](../../templates/default) with its own content, so the site always shows what the current template can do.

| Folder | What it is | In git |
| --- | --- | --- |
| `content/` | The site's pages and settings, written by the editor | yes |
| `src/assets/uploads/` | The site's images | yes |
| `src/forms/` | The site's own form handlers (`defineForm` from `bearminion/forms`, see the Forms guide). The sync never touches it | yes |
| `public/videos/` | The editor demo video on the home page | yes |
| `sections/` | Section types only this site has, such as the editor demo under the hero. The sync copies them next to the template's and lists them with `bearminion sync` | yes |
| `astro.config.ts`, `tsconfig.json`, the rest of `src/` | Copied from `templates/default` by `scripts/sync-template.mjs` before every `dev`, `build` and `typecheck` | no |

Tailwind skips files listed in `.gitignore`, so the sync also adds an `@source` line for each copied `src/` folder to the copy of the stylesheet. Without them the site would build with most of its styles missing. CI catches that: `pnpm --filter @bearminion/web check-styles`, run after `pnpm build` and `pnpm web:build`, fails when the site's CSS lacks a class the template's CSS has and the site's code uses.

## Edit the site

```bash
pnpm web:dev
```

Open the address it prints, press Ctrl+E (Cmd+E on a Mac), edit, and press Ctrl/Cmd+S. Commit `content/` and `src/assets/uploads/`.

## Change a component or add a section

Change it in `templates/default`, never here: the copy in this folder is replaced on the next sync. A section this site needs is a new section type in the template, so every BearMinion site can use it.

The exception is a section no other site would want, such as `sections/editor-demo/`, the working mock of the editor that sells BearMinion. It goes in `sections/<name>/`, laid out like a template section (`definition.ts`, `wireframe.ts`, the component), and imports the template's files with the paths they have once copied to `src/components/sections/<name>/`. It is not in the registry, so `npx bearminion add` never offers it. A name the template already uses stops the sync.

To see template changes here while you work, keep the copy up to date in a second terminal:

```bash
pnpm --filter @bearminion/web sync --watch
```

## Dependencies

`package.json` lists the same dependencies as the template, without Storybook, plus `bearminion-site` (`workspace:*`), the template itself. Nothing imports it: it tells Vercel that this site is built from `templates/default`, so with **Skip deployment** on (Project → Settings → Build and Deployment → Root Directory) a change to the template still redeploys bearminion.com. The sync's dependency check ignores it. The sync stops with a list of differences when they drift apart, for example after a dependency update in the template. To fix it:

```bash
pnpm --filter @bearminion/web sync --fix-deps
pnpm install
```
