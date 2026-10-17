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

## Repository layout

- `packages/editor` is the published `bearminion` package. Source in `src/`, unit tests in `test/` (Vitest).
  - `src/index.ts` must stay runtime-neutral: `test/entries.test.ts` fails if it reaches a Node, Astro or Vite import. Server code belongs behind `src/astro.ts`.
  - `src/ui/` is the editor overlay (Preact in a shadow root). `ui/api-client.ts` is the only module that calls the dev API; request and response types live in `src/api-types.ts`, shared with the server.
    - `ui/state/` holds the overlay's state and actions: `createEditor()` builds one instance from slices (document, UI, layout, undo, local drafts, session, sections, link editor) on `@preact/signals`. Building it has no side effects, so the slices are unit-tested without a browser (`test/editor-state.test.ts`).
    - `ui/controllers/` connects an editor to the page: page editing, pointer tracking, shortcuts, the reload guard and signal reactions. Each `attach…(editor)` returns its own cleanup, and `attachEditor` runs them all once.
    - `ui/overlay/`, `ui/sidebar/` and `ui/dialogs/` are components that read the editor through `useEditor()`. `ui/forms/` and `ui/chrome/` are the sidebar forms and the page bars. Overlay positions come from pure functions in `state/overlay.ts`; render never measures the DOM.
    - `ui/assets/` holds the overlay's own images. The editor ships its assets and never uses the site's.
- `templates/default` is the site people create. Treat it as user code: plain Astro, no imports from the monorepo, and `bearminion` by version range.
- `tests` holds the template's unit tests and the editor's end-to-end suite.
- `docs` is the reference documentation. A change to the content format, the editor, the API or the theme contract updates the matching page in the same pull request.

## Before you open a pull request

```bash
pnpm lint             # Biome: lint and formatting (pnpm format fixes formatting)
pnpm typecheck
pnpm test
pnpm test:e2e         # needs Playwright's Chromium: run pnpm e2e:setup once (and after a Playwright upgrade)
```

CI runs the same checks, plus `publint` and `@arethetypeswrong/cli` on the packed library, and installs a copy of the template with npm outside the monorepo.

- Keep pull requests focused, and add or update tests with behaviour changes. The e2e suite covers the editor UI; prefer a unit test when the logic can live outside a component.
- A change to the content schemas that would reject existing files needs a content migration (see [Content versions](docs/content.md#content-versions)).
- Every write the dev API accepts goes through Zod validation. Keep it that way, and keep the localhost checks in `src/security.ts` in front of every route.

## Changesets and releases

A pull request that changes the published package adds a changeset:

```bash
pnpm changeset
```

`bearminion` follows semver: `major` for a breaking change (including a content schema change that needs a migration), `minor` for a new feature, `patch` for a fix. The release workflow collects pending changesets into a "Version packages" pull request. That pull request also raises the template's `bearminion` range when needed. Merging it publishes to npm with provenance.

## Reporting bugs and security issues

Use the issue templates for bugs and feature requests. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
