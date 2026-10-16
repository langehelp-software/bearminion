# bearminion

## 1.0.0

First public release.

- Content model: pages and site settings as JSON in the repository, validated with Zod against the site's own `defineSection`, `defineSite` and `defineTheme` definitions, with content migrations (`schemaVersion`).
- Entry points: `bearminion` (runtime-neutral schemas and helpers), `bearminion/astro` (integration, file store, loaders), `bearminion/content`, `bearminion/rich-text` and `bearminion/marks`. `astro` 7 and `zod` 4 are peer dependencies.
- Dev-only inline editor: click-to-edit text, rich text (bold, italic, links, lists) on ProseMirror, section toolbar (move, add, duplicate, settings, delete), sidebar tabs for pages, section, navigation, footer, design and site settings, and a palette derived from three seed colors with WCAG contrast checks.
- Images: an upload library that includes the theme's own images, fit and position controls, and guards against deleting an image that saved content or the unsaved draft still uses.
- Saving: one transactional `POST /save` for the page and the site, with validation issues reported per file; undo and redo, version history in `.editor/history/`, drafts kept in `localStorage`, and optional local git commits (`bearminion({ git: true })`, never pushes).
- Security: the dev API answers only local, same-origin requests; uploads are checked by signature; pasted HTML is parsed and reduced to the supported subset.
- Production: `astro build` ships a static site with nothing from the editor in it.
