# bearminion.com

The BearMinion website, built with BearMinion. It runs the code of the [default template](../../templates/default) with its own content, so the site always shows what the current template can do.

| Folder | What it is | In git |
| --- | --- | --- |
| `content/` | The site's pages and settings, written by the editor | yes |
| `src/assets/uploads/` | The site's images | yes |
| `public/videos/` | The editor demo on the home page | yes |
| `astro.config.ts`, `tsconfig.json`, the rest of `src/` | Copied from `templates/default` by `scripts/sync-template.mjs` before every `dev`, `build` and `typecheck` | no |

Tailwind skips files listed in `.gitignore`, so the sync also adds an `@source` line for each copied `src/` folder to the copy of the stylesheet. Without them the site would build with most of its styles missing. CI catches that: `pnpm --filter @bearminion/web check-styles`, run after `pnpm build` and `pnpm web:build`, fails when the site's CSS lacks a class the template's CSS has and the site's code uses.

## Edit the site

```bash
pnpm web:dev
```

Open the address it prints, press Ctrl+E (Cmd+E on a Mac), edit, and press Ctrl/Cmd+S. Commit `content/` and `src/assets/uploads/`.

## Re-record the editor demo

The home page's Media section plays `public/videos/bearminion-editor.mp4`, recorded by a script: it edits the hero heading, adds a section, switches its layout, repaints the palette and saves. Re-record it after a visible change to the editor or the template:

```bash
pnpm web:record-demo
```

It needs ffmpeg with libx264 (`brew install ffmpeg`) and Playwright's Chromium (`pnpm e2e:setup`). It runs the site from a throwaway copy, so its saves never touch `content/` or the version history, and writes the MP4 (1920 × 1080, H.264) and its poster, `src/assets/uploads/editor-demo-poster.png`. What it types and picks is in `DEMO` at the top of `tests/scripts/record-demo.mjs`.

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
