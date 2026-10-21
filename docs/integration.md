---
title: Astro integration and package
description: "The bearminion package entry points, the Astro integration options, custom content stores and how the package is built."
---

The package's entry points, the integration options, the storage interface and how the package is built.

## Entry points

| Import | Runs | What it has |
| --- | --- | --- |
| `bearminion` | Anywhere (server, browser, Storybook) | Schemas and field helpers, `defineSection`, `defineSite`, `defineTheme`, `defineThemePreview`, `defineWireframe`, marks, the palette (`themeCss`), migrations, API types |
| `bearminion/astro` | Node, in `astro.config.ts` | The integration (default export), `createFileStore`, `loadContent` / `loadPages` / `loadSite` |
| `bearminion/content` | Astro content layer | `contentCollections()` for `src/content.config.ts` |
| `bearminion/rich-text` | Anywhere | `renderRichText` and the rich-text helpers |
| `bearminion/marks` | Anywhere | Heading and wordmark marks |

`astro` and `zod` (v4) are peer dependencies. A test keeps the runtime-neutral entries free of Node, Astro and Vite imports.

## Astro integration

```ts
import bearminion from 'bearminion/astro'

export default defineConfig({
  integrations: [
    bearminion({
      contentDir: 'content',
      uploadsDir: 'src/assets/uploads',
      sections: sectionDefinitions,
      site: siteDefinition,
    }),
  ],
})
```

`contentDir` defaults to `content`. `uploadsDir` defaults to `src/assets/uploads`. Both are resolved from the Astro project root unless they are already absolute. `sections` and `site` are required: the site's section definitions and its `defineSite` result. They validate page and site writes and feed the editor's catalog (labels, options, defaults, wireframes, header and footer controls and limits).

The integration hooks `astro:config:setup` and `astro:server:setup`. Outside `astro dev` (`build`, `preview`, `sync`) it returns immediately: no routes, no injected scripts, no Vite plugin. Nothing from this API is added to the production build.

During `astro dev` the integration injects `virtual:bearminion-editor` into the page. That module mounts a Preact overlay in an open shadow root, so the editor styles never meet the site's Tailwind layer. The overlay is not registered for `astro build`.

## Content store

The editor API reads and writes content through a `ContentStore`, never through `fs`. The default store is the local project (`createFileStore`, using `contentDir` and `uploadsDir`), and `bearminion({ store })` replaces it:

```ts
interface ContentStore {
  read(key: string): Promise<string | undefined> // `site.json`, `pages/about.json`: paths inside the content directory
  exists(key: string): Promise<boolean>
  list(dir: string): Promise<string[] | undefined> // file names in `pages`, or undefined when it does not exist
  apply(operations: StoreOperation[]): Promise<void> // writes and removals that belong together (a rename, set-home)
  uploads: { list(): Promise<…>; save({ originalName, bytes, kind }): Promise<…>; remove(filename): Promise<boolean> }
}
```

Values are text. Validation, parsing and the file layout (sorted keys, two spaces, trailing newline) stay in the editor, so every store writes the same bytes. `apply` runs writes before removals; a store that can make the whole batch atomic, such as a single commit, should.

Not part of the store: undo history (local editor state in `.editor/history/`), Commit changes (needs a local git work tree, so the `git` option only works with the default store), the live-reload watcher, the dev route that serves images for preview, and the build-time loaders (`loadContent`, `loadPages`, `loadSite`), which read the local content directory.

```ts
import { loadContent } from 'bearminion/astro'
import { sectionDefinitions } from './src/components/sections/definitions'
import { siteDefinition } from './src/components/organisms/site-definition'

const model = { sections: sectionDefinitions, site: siteDefinition }
const content = loadContent('/absolute/path/to/content', model) // { site, pages }
sectionDefinitions.hero.schema.parse(sectionDefinitions.hero.defaults)
```

## Build and package

The package ships compiled. `pnpm --filter bearminion build` runs [tsdown](https://tsdown.dev): one ESM bundle per entry point plus shared chunks, bundled `.d.ts` files, and the editor overlay as `dist/ui/mount.js` with its Preact JSX compiled and its stylesheet (`src/ui/editor.css`) inlined. Preact, zod and astro stay external. `@preact/signals`, which holds the overlay's state, is bundled into `mount.js`, so Vite never meets a new dependency mid-session (its optimizer would reload the page). The overlay's own images, such as the bear in the sidebar header, live in `src/ui/assets/` and are bundled too: the editor never reads the site's files. `files` limits the tarball to `dist`, the README, the changelog and the license, and `prepack` builds first, so `npm pack` and `npm publish` are safe from a clean checkout. CI runs `publint` and `@arethetypeswrong/cli` on the packed tarball. The tests import `src/` directly.

When working on BearMinion itself, the monorepo's template resolves `bearminion` to `dist/`, so rebuild after changing the library: `pnpm install` does it once, and `pnpm dev` runs `tsdown --watch` next to the template's `astro dev`.
