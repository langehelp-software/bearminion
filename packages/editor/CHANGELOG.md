# bearminion

## 1.2.0

### Minor Changes

- 4c3f823: Rich text has inline code: text between backticks is stored as `` `code` ``, rendered as `<code>`, and toggled with a new Code button in the on-page format bar. Nothing inside code is parsed as markdown. List items under `points` are edited as rich text in the sidebar.
- 19c1e5a: Section tab controls follow the section's schema instead of guessing from values:
  
  - Any string enum inside a section's props (such as a list item's `icon`) is a choice in the sidebar instead of a free text box. A new `icons` option on `defineSection` draws the choices of a field as an icon grid: `icons: { 'steps[].icon': { terminal: 'M4 5h16…', … } }`, SVG path data on a 24 × 24 grid, one per choice.
  - A new `showWhen` option on `defineSection` hides props the section's options make unused, such as `{ poster: { kind: 'video' } }`. A list matches any of its values, and `variant`, `tone` and `motion` count as options. Hidden props keep their value in the file.
  - Variant, tone and choice options with up to four choices are segmented controls instead of selects.
  - An image prop that is missing from the content now offers an image slot whatever it is called. It used to be a text box unless the prop was named `image` or `logo`, so a missing `poster` could not be set.
  
  `defineSection` checks `icons` and `showWhen` against the schema and options and throws on a mistake. `GET /schema` serves `fieldChoices`, `fieldIcons`, `fieldImages` and `showWhen`.

### Patch Changes

- 9261888: The live preview now runs the scripts of a section type that was not on the page before, so a section added from the picker works before you save (a copy button, a looping video). A sidebar value that has no text of its own on the page, such as a video link or a section option, now updates the preview as you change it instead of after a save.

## 1.1.0

### Minor Changes

- 8a97a6c: Released together with `create-bearminion`, which now shares this version number. No changes to the package.

## 1.0.1

### Patch Changes

- 0fb0cc9: Published through npm trusted publishing, with a provenance attestation that links the package to its source commit and build. No code changes.

## 1.0.0

First public release.

- Content model: pages and site settings as JSON in the repository, validated with Zod against the site's own `defineSection`, `defineSite` and `defineTheme` definitions, with content migrations (`schemaVersion`).
- Entry points: `bearminion` (runtime-neutral schemas and helpers), `bearminion/astro` (integration, file store, loaders), `bearminion/content`, `bearminion/rich-text` and `bearminion/marks`. `astro` 7 and `zod` 4 are peer dependencies.
- Dev-only inline editor: click-to-edit text, rich text (bold, italic, links, lists) on ProseMirror, section toolbar (move, add, duplicate, settings, delete), sidebar tabs for pages, section, navigation, footer, design and site settings, and a palette derived from three seed colors with WCAG contrast checks.
- Images: an upload library that includes the theme's own images, fit and position controls, and guards against deleting an image that saved content or the unsaved draft still uses.
- Saving: one transactional `POST /save` for the page and the site, with validation issues reported per file; undo and redo, version history in `.editor/history/`, drafts kept in `localStorage`, and optional local git commits (`bearminion({ git: true })`, never pushes).
- Security: the dev API answers only local, same-origin requests; uploads are checked by signature; pasted HTML is parsed and reduced to the supported subset.
- Production: `astro build` ships a static site with nothing from the editor in it.
