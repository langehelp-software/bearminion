<p align="center">
  <img src=".github/assets/banner.png" alt="BearMinion: a git-based CMS for Astro. Click to edit. Commit to publish." width="100%" />
</p>

<p align="center">
  A git-based, no-database CMS for <a href="https://astro.build">Astro</a>.<br />
  Edit your site inline while <code>astro dev</code> runs. Ship a plain static build.
</p>

<p align="center">
  <a href="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml"><img src="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/bearminion"><img src="https://img.shields.io/npm/v/bearminion?color=169717" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-169717" alt="MIT license" /></a>
</p>

Pages and site settings are JSON files in your repository. In development, click any text on the page to change it, rearrange sections, upload images and adjust the palette; BearMinion validates the change and writes the JSON back to disk. `astro build` produces a static site with no editor, no server and no database in it.

## Install

Requires Node 22.12 or newer.

```bash
npm create astro@latest -- --template langehelp-software/bearminion/templates/default my-site
```

This creates `my-site` from the default template: an Astro and Tailwind site with ten section types, wired to the `bearminion` package. The site is yours from here on; the template is the theme.

## Quick start

```bash
cd my-site
npm run dev
```

1. Open the URL Astro prints and press **Ctrl+E** (**Cmd+E** on a Mac) to open the editor.
2. Click any text to edit it, hover a section for its toolbar, and use the sidebar for pages, navigation, footer, design and SEO.
3. Press **Ctrl/Cmd+S** to save. The changes land in `content/` and `src/assets/uploads/`.
4. Commit and push. Vercel, Netlify, Cloudflare Pages or any static host builds the site from the repository with `npm run build`.

<p align="center">
  <img src=".github/assets/editor.png" alt="The BearMinion editor over the default template: the section toolbar on the hero, a heading being edited, and the Pages tab in the sidebar" width="100%" />
</p>

## What else it can do

The editor is built from your site's own schemas, so it can only write content that your theme renders and that passes validation. Beyond inline text, it handles rich text (bold, italic, links and lists, stored as a small markdown subset), section variants, tones and reordering, an image library with fit and position controls, a palette derived from three seed colors with WCAG contrast checks, per-page SEO and social images, and multi-level navigation. Every save is kept in `.editor/history/` with undo and redo across the draft, and with `bearminion({ git: true })` the Save menu can commit the changed content files for you (it never pushes).

To build your own look, change the template's components and styles, or add a section type: one directory with a Zod schema, defaults and a component, and the editor picks it up. See [Add a section type](templates/default/README.md#add-a-section-type).

## Documentation

| Read | For |
| --- | --- |
| [`templates/default/README.md`](templates/default/README.md) | The template: components, sections, SEO, Storybook, adding a section type |
| [`packages/editor/README.md`](packages/editor/README.md) | The `bearminion` package: content files, the Astro integration, the editor, the dev API and the [theme contract](packages/editor/README.md#theme-contract) |

## Directory

| Folder | What it is | Published |
| --- | --- | --- |
| [`packages/editor`](packages/editor) | `bearminion`: the content model, the Astro integration and the editor overlay | [npm](https://www.npmjs.com/package/bearminion) |
| [`templates/default`](templates/default) | The default site and theme, created with `npm create astro` | as a template |
| [`tests`](tests) | The template's unit tests and the editor's end-to-end suite (Playwright) | no |

## Security

The editor and its API exist only in `astro dev`. The API answers loopback connections with a local `Host` and `Origin` and, from a browser, `Sec-Fetch-Site: same-origin`, so other sites open in your browser and other machines on your network cannot write to your content. Report a vulnerability as described in [SECURITY.md](SECURITY.md).

## Contributing

Requires Node 22.12+ and pnpm (the version in `packageManager`; `corepack enable` picks it up).

```bash
pnpm install          # also builds packages/editor
pnpm dev              # library in watch mode + the template's astro dev
pnpm test             # unit tests (library and template)
pnpm e2e:setup        # once, and after a Playwright upgrade: downloads its Chromium
pnpm test:e2e         # editor end-to-end tests in Chromium
pnpm lint             # Biome
pnpm typecheck        # tsc and astro check
```

The template depends on `bearminion` by version range, not `workspace:*`, so the same folder installs outside this repository; pnpm links the range to `packages/editor` here. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, changesets and releases, and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Jakub Lange
