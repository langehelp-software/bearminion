# Contributing to BearMinion

Thanks for helping. Bug reports, fixes, new section ideas and documentation are all welcome. Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

- Node 22.12 or newer.
- pnpm at the version in the root `package.json` (`packageManager`). `corepack enable` installs it.

```bash
pnpm install          # installs everything and builds packages/editor
pnpm dev              # tsdown --watch for the library, astro dev for the template
```

Open http://localhost:4321 and press Ctrl+E (Cmd+E) for the editor.

The two websites run from this repository too:

```bash
pnpm web:dev          # bearminion.com (apps/web): the template's code with the site's own content, edited with BearMinion
pnpm docs:dev         # docs.bearminion.com (apps/docs): Starlight, reading the pages in docs/
```

bearminion.com runs the template's code, copied in before every `dev`, `build` and `typecheck`, so change components in `templates/default`, never in `apps/web` (see [its README](apps/web/README.md)). The docs are the Markdown files in `docs/`; a page there is a page on docs.bearminion.com, and the docs build fails on a broken link or anchor.

## Repository layout

- `packages/editor` is the published `bearminion` package. Source in `src/`, unit tests in `test/` (Vitest).
  - `src/index.ts` must stay runtime-neutral: `test/entries.test.ts` fails if it reaches a Node, Astro or Vite import. Server code belongs behind `src/astro.ts`.
  - `src/ui/` is the editor overlay (Preact in a shadow root). `ui/api-client.ts` is the only module that calls the dev API; request and response types live in `src/api-types.ts`, shared with the server.
    - `ui/state/` holds the overlay's state and actions: `createEditor()` builds one instance from slices (document, UI, layout, undo, local drafts, session, sections, link editor) on `@preact/signals`. Building it has no side effects, so the slices are unit-tested without a browser (`test/editor-state.test.ts`).
    - `ui/controllers/` connects an editor to the page: page editing, pointer tracking, shortcuts, the reload guard and signal reactions. Each `attach…(editor)` returns its own cleanup, and `attachEditor` runs them all once.
    - `ui/overlay/`, `ui/sidebar/` and `ui/dialogs/` are components that read the editor through `useEditor()`. `ui/forms/` and `ui/chrome/` are the sidebar forms and the page bars. Overlay positions come from pure functions in `state/overlay.ts`; render never measures the DOM.
    - `ui/assets/` holds the overlay's own images. The editor ships its assets and never uses the site's.
- `packages/create-bearminion` is the published `npm create bearminion` CLI. Its build copies `templates/default` into `template/` (ignored by git) and fails when the template's `bearminion` range does not match the package version.
- `templates/default` is the site people create. Treat it as user code: plain Astro, no imports from the monorepo, and `bearminion` by version range.
- `tests` holds the template's unit tests, the editor's end-to-end suite and the script that records the editor demo for bearminion.com (`pnpm web:record-demo`, see [apps/web](apps/web/README.md)).
- `apps/web` is bearminion.com and `apps/docs` is docs.bearminion.com, each deployed by its own Vercel project.
- `docs` is the reference documentation. A change to the content format, the editor, the API or the theme contract updates the matching page in the same pull request.

## Before you open a pull request

```bash
pnpm lint             # Biome: lint and formatting (pnpm format fixes formatting)
pnpm typecheck
pnpm test
pnpm test:e2e         # needs Playwright's Chromium: run pnpm e2e:setup once (and after a Playwright upgrade)
```

CI runs the same checks, plus `publint` and `@arethetypeswrong/cli` on the packed library, and installs a copy of the template with npm outside the monorepo. It also builds bearminion.com and the docs (the docs build fails on a broken link), checks that the site's CSS has every template class its code uses, and fails when a build changes a tracked file. A pull request that only changes `apps/web/content/`, `apps/web/src/assets/uploads/` or `apps/web/public/` runs only the site builds.

- Keep pull requests focused, and add or update tests with behaviour changes. The e2e suite covers the editor UI; prefer a unit test when the logic can live outside a component.
- A change to the content schemas that would reject existing files needs a content migration (see [Content versions](docs/content.md#content-versions)).
- Every write the dev API accepts goes through Zod validation. Keep it that way, and keep the localhost checks in `src/security.ts` in front of every route.

## Changesets and releases

A pull request that changes a published package (`bearminion`, `create-bearminion`, or the template that `create-bearminion` ships) adds a changeset:

```bash
pnpm changeset
```

`bearminion` follows semver: `major` for a breaking change (including a content schema change that needs a migration), `minor` for a new feature, `patch` for a fix. The release workflow collects pending changesets into a "Version packages" pull request. That pull request also raises the template's `bearminion` range and refreshes the lockfile. Merging it publishes to npm through trusted publishing, with provenance. `bearminion` and `create-bearminion` are one fixed group, so they always release together with the same version, and a CLI always creates sites on the matching editor.

## Reporting bugs and security issues

Use the issue templates for bugs and feature requests. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
