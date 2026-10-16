# bearminion

Content model and dev-only editor for BearMinion, a git-based CMS for Astro. Page and site content is JSON in the repo. This package validates that JSON and, during `astro dev`, adds an inline editor and a localhost API that writes it back. Production is a plain static Astro build: nothing from the editor ships.

```bash
npm install bearminion zod
```

Start from the default template instead of wiring it by hand: see the repository README.

## Entry points

| Import | Runs | What it has |
| --- | --- | --- |
| `bearminion` | Anywhere (server, browser, Storybook) | Schemas and field helpers, `defineSection`, `defineSite`, `defineTheme`, `defineThemePreview`, `defineWireframe`, marks, the palette (`themeCss`), migrations, API types |
| `bearminion/astro` | Node, in `astro.config.ts` | The integration (default export), `createFileStore`, `loadContent` / `loadPages` / `loadSite` |
| `bearminion/content` | Astro content layer | `contentCollections()` for `src/content.config.ts` |
| `bearminion/rich-text` | Anywhere | `renderRichText` and the rich-text helpers |
| `bearminion/marks` | Anywhere | Heading and wordmark marks |

`astro` and `zod` (v4) are peer dependencies. A test keeps the runtime-neutral entries free of Node, Astro and Vite imports.

## Content directory

```text
content/
  site.json
  pages/
    index.json
    about.json
```

`loadContent(contentDir, model)` reads that directory with Node `fs`, validates it, and returns `{ site, pages }`. Schema failures throw `ContentValidationError` with the file path and a list of `path` + `message` issues. Missing files and broken JSON throw `ContentReadError`.

The home page uses slug `index`. Other slugs are lowercase kebab-case (`about`). Filenames are not required to match the slug, but the starter does.

## site.json

- `name` — site name
- `nameMarks` — optional ranges inside `name` (`start`, `end`, and any of `weight`, `italic`, `font`). `font` is `sans`, `serif`, or `mono`. `weight` is `regular`, `medium`, `semibold`, or `bold`. A legacy `nameEm` substring is accepted on input and stored as one serif italic mark.
- `url` — canonical origin, used for canonical URLs, the sitemap, and absolute Open Graph images
- `lang` — optional BCP 47 language tag (`en`, `pl`, `pt-BR`) for `<html lang>`; the template defaults to `en`
- `seo` — site defaults: optional `titleTemplate` (`%s` is replaced with the page SEO title), `description`, and `ogImage`
- `favicon` — optional `{ src, alt }`, the browser tab icon. A legacy `logo` key is read as `favicon` and stored under the new name.
- `brandLogo` — optional `{ src, alt, height? }`. Shown in the header and footer instead of the name; `height` is 16–64 px (28 when omitted). The icon box beside the name is gone: the brand is either the name or this image.
- `theme.mode` is `light` or `dark`. A legacy `system` reads as `light`.
- `theme` — `mode` (`light`, `dark`, or `system`, default `light`) and `motion` (default `true`)
- `header` — `variant` (`bar`, `centered`, `floating`), `tone`, `sticky`, `links`, and and `actions`, up to two header buttons shown left to right (the last is the primary button; an empty list hides them). Older `cta` and `signIn` fields are still read, as `signIn` then `cta`, and are rewritten as `actions` on the next save
- `footer` — `variant` (`simple`, `columns`, `wordmark`), `tone`, optional `text`, `legal`, and `badge` (the columns pill), and up to three `columns` of `{ title, links }`

## Pages

Each `content/pages/*.json` file:

- `slug`, `title`
- `seo` — `title`, `description`, optional `ogImage`, `noindex` (default `false`), `nofollow` (default `false`), optional `canonical` (absolute URL or site-relative path)
- `sections` — ordered `{ id, type, variant, tone, motion?, props }`

The `404` page is a system page: the editor lists it apart, edits its content, and refuses to create, delete, rename or promote it, and the starter serves it as `/404.html`. Section `id`s are unique within a page. `props` are checked against the Zod schema registered for `type`. `variant` and `tone` default per type (`tone` defaults to `base`). Headings stay plain strings. `marks` styles ranges inside `heading` the same way `nameMarks` styles the wordmark. A legacy `em` substring is accepted on input and stored as one serif italic mark. Links are `{ label, href, newTab?, id?, trackingId?, style? }`. `style` is `primary`, `secondary` or `tertiary` and applies to section buttons; the editor's link popover sets it, and leaving it unset keeps the look each section was designed with. `newTab` forces `target="_blank"` and `rel="noopener noreferrer"`. `id` is a lowercase slug, unique on the page, and it cannot match a section anchor. `trackingId` is still accepted and rendered as `data-analytics` when present in the JSON, but the editor no longer shows a field for it.

## Section registry

The package ships no section types. A site defines each one in its own directory and passes the set to `bearminion({ sections, site })`, `loadContent(dir, { sections, site })` and `loadPages(dir, sections)`. The starter's sections are `hero`, `logoStrip`, `features`, `textImage`, `stats`, `testimonials`, `pricing`, `faq`, `cta` and `contact`, each with three variants, in `templates/default/src/components/sections/<name>/`:

```text
hero/
  definition.ts   zod schema, defaults, variants, extra options, optional props, item counts
  wireframe.ts    the thumbnail in the Add section picker, as rectangles
  Hero.astro      the component
  Hero.stories.ts Storybook
```

`definition.ts` calls `defineSection({ type, label, description, schema, defaults, variants, defaultVariant, options?, optional, counts?, wireframe, refine? })`. `variants` becomes the section's `variant` field and control, and `options` adds controls after variant, tone and motion. `optional` names the props an author may drop (a test checks it against the schema). `counts` holds list-length rules per array prop. `refine` holds rules the schema cannot express, such as the bento variant needing exactly 4 items. `defaults` must already satisfy `schema`.

`wireframe.ts` is plain data, not a component: `defineWireframe([[left, top, width, height, kind], ...])` with percentages in a 100 × 100 frame and a kind (`title`, `text`, `block`, `button`, `outline`, `card`, `highlight`, `avatar`, `dark`, `light`, `figure`) that the editor draws in a fixed greyscale. It is plain data because the picker runs in the browser and cannot render `.astro`. `GET /schema` returns each section's wireframe and description, so the picker needs no knowledge of the section.

The starter lists its directories in `sections/definitions.ts` (no `.astro` imports, so `astro.config.ts` can load it) and `sections/registry.ts` (type → component). It derives its own `Section` and `Page` types from the registry with `SectionOf<typeof sectionDefinitions>`. Every configurable option has a `label`, a `type` of `enum` / `boolean` / `number` / `string`, `choices` and a `default`. In the starter, feature items are 3–6 and the bento variant needs exactly 4. FAQ items are 4–8. A pricing plan `cta` is a link `{ label, href }`. `yearlyDiscount` defaults to `0.2`.

Shared fields are `text`, `richText`, `image` `{ src, alt }`, `link` `{ label, href }`, and `tone` (`base`, `subtle`, `inverse`, `brand`). Atom vocabularies (button roles and sizes, the type scale) belong to the theme: the default template keeps them in `src/components/atoms/options.ts`, and section JSON never stores them. Fonts, radii, spacing, and density live in the design tokens. To add a type, add a directory like the one above and list it in `definitions.ts` and `registry.ts`.

## Site definition

The header and footer are the site's too. `defineSite` declares which layouts exist, how many buttons and columns they hold, and whether the footer has a badge:

```ts
import { defineSite, type SiteOf } from 'bearminion'

export const siteDefinition = defineSite({
  header: { variants: ['bar', 'centered', 'floating'], defaultVariant: 'bar', maxActions: 2, recommendedLinks: 4 },
  footer: { variants: ['simple', 'columns', 'wordmark'], defaultVariant: 'columns', maxColumns: 3, badge: true },
})
export type Site = SiteOf<typeof siteDefinition>
```

It returns `schema` (validates `site.json`, with `header.variant` and `footer.variant` as the unions above), `options` (the Header and Footer controls), `counts` and `limits`. `maxActions` and `maxColumns` default to 2 and 3, and `badge` to false. `defineSite` throws when a default variant is not in its list. `GET /schema` serves the options and limits, so the editor takes its layout choices, the header button cap, the footer column cap and the badge field from the site.

The tone names (`base`, `subtle`, `inverse`, `brand`), the light and dark color modes, and the palette derivation behind the Design tab stay in the package. A theme implements the `--t-<tone>-<token>` CSS variables that `themeCss()` writes.

## Theme contract

A theme is the site's own code (components, styles, sections). The library fixes a small vocabulary every theme implements, and `defineTheme` says what the editor should show for the parts a theme names:

- **Fixed:** four section tones (`base`, `subtle`, `inverse`, `brand`), each a set of `--t-<tone>-<token>` CSS variables that `themeCss()` writes from the site palette; two color modes (`light`, `dark`); three link looks the link popover offers (`primary`, `secondary`, `tertiary`); three font slots for heading marks (`sans`, `serif`, `mono`).
- **Declared:** the label and CSS family of each font slot, shown in the heading format bar.

```ts
import { defineTheme } from 'bearminion'

export const contentModel = {
  sections,
  site,
  theme: defineTheme({
    fonts: {
      sans: { label: 'Sans', family: '"Inter Variable", ui-sans-serif, system-ui, sans-serif' },
      serif: { label: 'Display', family: '"Fraunces", Georgia, serif' },
    },
  }),
}
```

A slot left out keeps a system font stack, and a model without `theme` uses `defaultTheme`. Load the fonts in the site; the editor only names them. `GET /schema` serves the theme as `theme`.

**Markup the editor reads.** Every section root carries `data-section-id`. Every editable value carries `data-field` with its path (`sections.0.props.heading`, `name`). For an image, put `data-field="…image.alt"` (or `logos.N.alt`) on the element that is the image's slot, the frame with its padding or placeholder, not only on the `<img>`: hovering and clicking anywhere on that element opens the image picker, and an empty slot has no `<img>` at all. Repeated copies of a slot, such as the second pass of a marquee, may carry the same `data-field`. Images the theme ships for its own content (logo, favicon, social preview, illustrations) belong in the uploads directory, so they appear in the image library like an upload.

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

## Content versions

Content files carry a `schemaVersion` (default 1; a file without one is version 1). When a schema change would reject files written before it, raise the version in the content model and add the step that upgrades the old shape:

```ts
export const contentModel = {
  sections, site,
  schemaVersion: 2,
  migrations: {
    // upgrades version 1 to 2; `kind` is 'page' or 'site'
    1: (doc, kind) => (kind === 'page' && 'name' in doc ? { ...omit(doc, 'name'), title: doc.name } : doc),
  },
}
```

- Every step below `schemaVersion` must exist, or `bearminion()` throws at startup.
- `loadContent()`, the editor API and `contentCollections()` run the steps in memory before validating, so schemas only describe the current shape and never see `schemaVersion`.
- Files are rewritten, stamped with the current version, when the editor saves them. Nothing is migrated on disk until then.
- A file newer than the site (`schemaVersion` above the model's) is refused with a `schemaVersion` error rather than guessed at.

## Build and package

The package ships compiled. `pnpm --filter bearminion build` runs [tsdown](https://tsdown.dev): one ESM bundle per entry point plus shared chunks, bundled `.d.ts` files, and the editor overlay as `dist/ui/mount.js` with its Preact JSX compiled and its stylesheet (`src/ui/editor.css`) inlined. Preact, zod and astro stay external. `@preact/signals`, which holds the overlay's state, is bundled into `mount.js`, so Vite never meets a new dependency mid-session (its optimizer would reload the page). The overlay's own images, such as the bear in the sidebar header, live in `src/ui/assets/` and are bundled too: the editor never reads the site's files. `files` limits the tarball to `dist`, this README and the license, and `prepack` builds first, so `npm pack` and `npm publish` are safe from a clean checkout. CI runs `publint` and `@arethetypeswrong/cli` on the packed tarball. The tests import `src/` directly.

In this monorepo the template resolves `bearminion` to `dist/`, so rebuild after changing the library: `pnpm install` does it once, and `pnpm dev` runs `tsdown --watch` next to the template's `astro dev`.

## Theme preview

The live preview is rendered by the theme, not the library. The module named by the `previewModule` option (default `/src/lib/render-preview.ts`) must default-export `defineThemePreview`, loaded through the Vite SSR runner:

```ts
import { defineThemePreview } from 'bearminion'
import type { contentModel } from './content-model'

export default defineThemePreview<typeof contentModel>({
  // Draft sections as HTML. `sections` is your registry's union; orphaned sections are already removed.
  async page({ sections, motion }) { return renderSections(sections, motion) },
  // Optional: header and footer of a draft site. Without it, those changes appear after save and reload.
  async site({ site, pathname }) { return { header: '…', footer: '…' } },
})
```

- The model type ties `sections` and `site` to your section registry and site definition, so a renamed field is a type error instead of a blank preview.
- A module without a default export of this shape fails with an error naming the file. The previous named exports `renderPagePreview` and `renderSitePreview` are no longer read.
- `POST /preview/site` answers `501` when the theme defines no `site` renderer.
- The default template renders with Astro's container API, which Astro still exports as `experimental_AstroContainer`. It is only used in dev, but an Astro upgrade can change it; the e2e suite covers the preview paths.

## Sections the site no longer defines

A page can hold a section whose `type` the site stopped defining (a section directory was removed or renamed). The site cannot draw it, so the build fails on it, by design. The editor still has to open the page and let you fix it:

- The editor API validates a page with the tolerant schema: a section with an unregistered `type` and a valid `id` is kept as it is, with any `props` and extra keys. Registered sections are validated in full.
- `PUT /pages/:slug` keeps an orphan the stored page already has, and refuses a new or retyped one (`400`, path `sections.N.type`).
- The preview leaves orphans out (`withoutOrphanSections`), and the section panel shows the section as "Unknown (type)" with a Delete button.
- `loadContent(dir, model, { tolerateOrphans: true })` and `contentCollections(model, { tolerateOrphans: true })` accept them for config and dev. Without this, `astro dev` exits at startup and the editor never opens. The starter turns it on in `astro.config.ts`, and in `content.config.ts` for dev only (`import.meta.env.DEV`), so `astro build` stays strict.
- With the dev option on, collection entries can hold orphans, so render pages through `withoutOrphanSections(page, registry)`. The starter's `lib/content.ts` does.

## Content collections

`bearminion/content` wires the content directory into Astro's content layer, so pages get typed `getCollection` / `getEntry` and dev-server refresh from Astro itself. It uses Astro's built-in `glob()` loader; there is no custom loader.

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content'
import { contentCollections } from 'bearminion/content'
import { contentModel } from './lib/content-model'

const { pages, site } = contentCollections(contentModel, { contentDir: '/absolute/path/to/content' })
export const collections = { pages: defineCollection(pages), site: defineCollection(site) }
```

Entries are validated by the section registry and site schemas; the `pages` id is the slug and the `site` collection holds one entry, `site`. `astro.config.ts` still calls `loadContent()`, because it runs before collections exist.

**Reload after a save.** With `contentCollections()` in use, Astro's loader refreshes the entry and then reloads the page itself, so the editor's own content-reload plugin steps aside (`contentCollections()` sets a process-wide marker the plugin checks). The editor still routes that reload through its save/discard prompt when a draft is dirty. Reloading earlier from the editor showed stale data and caused a second reload. A site that reads content some other way keeps the editor's reload.

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

## Editor

Open the template with `pnpm dev` from the repository root. A dock at the top right (preview, Saved/Unsaved pill, Save, and a panel button) opens the sidebar. The same shortcut is Ctrl+E or Cmd+E.

Click text marked `data-field` to edit it in place. Replacing a heading, or the site name, keeps inline marks aligned with the new text and drops a mark when its word is gone. Paste into a plain field stays plain text. Enter commits a single-line field. Selecting words in a heading or the site name opens a format bar for weight (regular, medium, semibold, bold), italic, and font (sans, serif, mono). Fields whose path ends in `body`, `intro`, `sub`, `description`, `quote`, `note`, `thanks`, or `a`, and any field with `data-field-kind="rich"`, are edited as formatted text. The toolbar applies bold, italic, a link, a bulleted list, and a numbered list. Enter in a list starts the next item. Enter on an empty item leaves the list. Enter elsewhere inserts a line break. The value stored in JSON is markdown (`**bold**`, `*italic*`, `[text](url)`, `- item`, `1. item`, blank lines for paragraphs). A link can add `{new}` or `{same}` so the new-window choice round-trips. The starter renders that markdown as `strong`, `em`, `a`, `br`, `p`, `ul`, and `ol`, escapes every other character, drops `javascript:`, `data:`, and `vbscript:` URLs, and sets `target="_blank"` and `rel="noopener noreferrer"` on `http` and `https` links unless `{same}` is set. Pasted HTML is parsed with `DOMParser`, read back as that markdown subset and rendered again, so only those tags reach the page: headings, images, attributes and event handlers from the clipboard are dropped. There are no heading or image buttons. Click an image slot on the page (the image, its frame or an empty placeholder) to open the image picker over the page. Hovering a section image at least 260 × 64 px shows a bar with Fit, Position and Change instead of the Change image chip. An image whose file is gone shows a Missing image placeholder on the page and File not found in its field, and the save fails until another image is chosen.

Hover or select a section for an outline and a toolbar glued to that section’s top edge. The toolbar stays visible while the section is in view: after the section top scrolls past, it pins under a sticky site header until the section ends, including while the sidebar is open. Scrolling does not hide it, and it does not cover the next section’s toolbar. The order is the section name, move up, move down, add, duplicate, settings, and delete. The name is the catalog label plus the anchor when one is set (`Pricing · #pricing`), truncated, with the full text in a tooltip. Move up and move down disable at the ends. Add opens “Add above” and “Add below”, then the section-type list. Duplicate and delete ask for confirmation and only then change the draft. Settings opens the sidebar on the Section tab for that section. Delete uses a danger style. Escape cancels a confirmation. Enter confirms it.

The sidebar tabs are Pages, Section, Navigation, Footer, and Site. It opens on Pages, and after a reload it comes back open on the tab you were on. The header shows the current file, a Saved or Unsaved pill, a Save button (same as Ctrl/Cmd+S), and a close button.

- Pages — the page list (follow a link, delete, or create from a section template with New page), then the current page: title, slug (rename on save) and a Home page switch (the home page is `index`, shows a home badge in the list, and its slug is locked; turning the switch on for another page asks before replacing the current home, which moves to a slug generated from its title), SEO title, description with a character count, canonical, og image, noindex, nofollow, and a numbered outline of the sections. Clicking an outline row opens that section on the Section tab.
- Section — a section picker, then Layout (variant, tone as four colour cards, motion as Site default / On / Off, and the anchor), then Content (the other options and every prop). Every image field (section images, logo, OG images) is the same control: an empty slot, or a thumbnail with file name, alt text (not on OG images), Fit (Cover, Contain, Auto) and Position (a 3×3 grid, disabled for Auto) on images that sit in a frame (not logos), Change image and Remove. Images that sit in a section also have a Show in section switch: off writes `hidden: true`, which removes the image and its frame from the page while the file and alt text stay. Clicking the slot or Change image opens a modal with an Upload tab (drop a file or click to browse) and a Library tab (pick an upload, or delete one from disk after a confirm; an image that saved content still uses cannot be deleted, and the error names where it is used). A field whose file is gone says File not found. Link fields open the same Edit link popover as the page. Lists are collapsible rows with move and remove. Section text and buttons are optional: clear an optional text field and it is hidden on the page and dropped from the file on save; a button has a Remove control and, once gone, an Add slot. A wrapper whose children are all gone (a section header, an actions row) is not rendered. What defines an item, such as a feature title or a question and its answer, stays required, so remove the whole item instead. `section-optional.ts` lists the optional props. Duplicate section and Delete section sit at the bottom and ask for confirmation. The anchor is a lowercase slug, unique on the page. The field suggests one from the heading (or the section type) when it is empty. The section element uses it as `id`. `data-section-id` stays the section id.
- Site — Identity (name with style buttons for the selected text and a wordmark preview, URL, favicon), Search defaults (title template, description, og image), then Theme from `siteOptions`.
- Footer — layout (variant, tone), text, legal line, badge, and up to three columns. Add and remove columns, drag a column by its header to reorder, and drag a link onto another column to move it. Each drag shows what a drop will do. Columns are aligned to the right edge of the footer.
- Design — three seed colors (brand, neutral, link) and the color mode. The tone palettes and dark mode are derived from them (`theme.colors` in `site.json`, `#rrggbb`). Text on fills picks near-black or near-white by contrast, links are moved to 4.5:1, and the tab lists any text pair still under WCAG AA. The page previews the palette live. The layout injects `themeCss(site.theme.colors)` as `<style id="bm-theme">`; a site without colors ships nothing extra. For full control, the Advanced switch “Override individual colors” replaces any token (background, text, muted text, surface, accent, text on accent, link) per mode and tone via `theme.colors.tones.<light|dark>.<tone>.<token>`; the border follows the text color. Turning the switch off sets `theme.colors.customTones` to `false`: the overrides stay in the file but are not applied. Overrides are checked by the same contrast panel. The editor's own colors are separate and unaffected.
- Preview — the eye button in the header (or the closed-editor bar) hides every panel, outline and bar so the page looks as visitors see it. A bubble at the bottom right, or Esc, exits and reopens the sidebar if it was open.
- Footer bar — the footer carries a small “Footer” bar with a settings button that opens the Footer tab.
- Navigation — brand (name or logo image with a height slider), header layout (variant, tone, sticky), then drag a row to reorder or nest, indent and outdent, and pick a link target. Nesting stops at `MAX_NAV_DEPTH` (3): a top-level link, a child, and a grandchild. The same link control edits header links, up to two header buttons, footer links, button and plan links. It offers existing pages, `#anchor` on the current page, `/page#anchor` on other pages, and a custom URL. An internal link to a missing page or anchor shows a warning and does not block save. Clicking a link or button on the page opens a popover for the label, URL, and “Open in new window”. Buttons and call-to-action links also take an optional HTML id, and optional buttons have a “Remove” action. Clicking an image on the page opens the image picker over the page, without the sidebar.

The panel starts at 440px. A handle on its left edge drags the width, arrow keys step it, and a double-click resets it. The width stays between 380px and 40% of the viewport (the minimum shrinks when 40% is smaller than 380px) and is stored in `localStorage` as `bearminion:sidebar-width`. While the sidebar is open the page gets that much right padding, so the section being edited stays beside the panel.

Edits stay in an in-memory draft. Text changes the DOM immediately. Tone and motion update the `data-*` attributes on the section, so tone colors follow the existing CSS. A variant change, or a section you add, duplicate, move, or delete, is sent to `POST /__bearminion/api/preview`. The dev server validates that JSON, renders the page sections with Astro's container API through the Vite SSR module runner (the theme's `defineThemePreview` module, `/src/lib/render-preview.ts` by default), and returns HTML. The overlay replaces `main#content` and dispatches `bearminion:preview` so section scripts can bind the new nodes. The preview response is not written to disk. Header, navigation, footer, and other `site.json` fields appear after you save and reload. The first time one of those fields changes, the editor asks you to save and reload now or keep editing, and the sidebar keeps that notice while the site draft is dirty.

Save sends the page and the site in one `POST /save`. The server validates both, including a rename or a move to home, before it writes anything, then writes them together; the page reloads only after that succeeds. A validation error stays on the page and lists the field errors. A content-file change, a Vite full reload, a link to another page, or a page opened from the Pages tab goes through the same choice when the draft is dirty: save and reload, discard changes, or cancel. Save and reload writes the page and the site before it navigates. Ctrl/Cmd+S is the only way to write the draft to disk.

While a draft differs from the last saved JSON, the editor autosaves it to `localStorage` after about 500ms. Keys are `bearminion:draft:<projectId>:page:<slug>` and `bearminion:draft:<projectId>:site`. `projectId` is a hash of the dev server root and the site name, so two projects on the same localhost port do not share drafts. Each record stores the draft, a timestamp, and a hash of the on-disk JSON it was based on. Drafts older than 14 days are removed. If storage is disabled or full, the editor keeps editing and skips the autosave.

Opening the page shows the on-disk JSON. When a stored draft exists, a banner says "Unsaved changes from <relative time>" and offers Restore or Discard. If the file changed after the draft was based on it, the banner also says the file on disk has changed, and Restore and Discard still work. A successful save or Discard clears the stored draft. Another tab that saves the same page raises "Another tab saved this page."

The Unsaved pill shows while the draft differs from the last successful save. Ctrl+S or Cmd+S writes the page and site with `POST /save`. Field errors from the API are listed in the sidebar and repeated next to the matching control. Closing or reloading the tab with unsaved edits triggers the browser's beforeunload warning. Save does not create a git commit unless you use Save menu → Commit changes… (see `git` below).

Escape blurs the field you are editing, then closes a confirmation, the link popover, the heading format bar, or the add-section picker, then closes the sidebar. Left and Right move between the sidebar tabs when focus is on the tab list. Arrow keys on the resize handle change the sidebar width.

A newly uploaded image is stored under `src/assets/uploads` and appears in the library immediately. In dev, a `src/assets/` path that is not in the eager `import.meta.glob` is rendered as a plain image whose URL is `/__bearminion/assets?src=...`. That route only serves a file inside `src/assets` or the uploads directory, and only to localhost. Production builds do not include the route. They still resolve the path with the glob and Astro `<Image>`, and they still fail the build when the file is missing.

## Dev API

Base path: `/__bearminion/api`. Only loopback clients are accepted. `Host` must be `localhost`, `127.0.0.1`, or `::1`. If `Origin` is present, its host must be one of those too. If the browser sends `Sec-Fetch-Site`, it must be `same-origin` or `none`, which also stops a no-cors GET from another site (it carries no `Origin`). The TCP peer must be loopback (`127.0.0.1`, `::1`, or `::ffff:127.0.0.1`). Anything else is `403` and the handler does not read or write files.

Slugs are lowercase kebab-case. Encoded `..`, slashes, and backslashes are rejected. Upload filenames are reduced to a safe stem, then stored with a random suffix and an extension taken from the sniffed image type.

JSON bodies are limited to 1MB. Images are limited to 5MB and must be png, jpeg, webp, gif, or avif, with a matching `Content-Type` and file signature.

Every write is checked with the Zod schemas first. A failure is `400`:

```json
{
  "error": "validation",
  "message": "The document failed schema validation.",
  "issues": [{ "path": "url", "message": "Invalid URL" }]
}
```

`POST /save` validates the page and the site in one request and returns the issues of both, each with `"file": "page"` or `"file": "site"` so a path such as `title` can be told apart. The other write routes leave `file` out.

The file on disk is left unchanged. Successful JSON writes use a temp file in the same directory, then `rename`. The temp name does not end in `.json`. The file is 2-space JSON, object keys sorted, with a trailing newline. Schema defaults such as `seo.noindex: false` are written out.

After a content JSON file changes, the dev server invalidates its module graph, sends Astro's `astro:content-changed` event (so `getStaticPaths` runs again), and asks the editor to reload. The editor reloads when the draft is clean. When it is dirty, the editor asks to save and reload, discard, or cancel. Page data is read with `fs`, so a normal module HMR update would not see it. Uploading an image does not reload the page by itself, so the unsaved draft stays put. The preview renders that file immediately. If Vite reloads anyway, the stored draft is offered again from `localStorage`.

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| `GET` | `/schema` | | `{ sectionOptions, siteOptions, siteLimits, theme, contentCounts, … }` |
| `POST` | `/save` | `{ page?: { from, document, previousHomeSlug? }, site? }` | `{ page?, site? }` as stored. Validates everything, then writes in one store `apply`. `from` is the stored slug; a different `document.slug` renames the page, and `index` makes it the home page (the old home moves to `previousHomeSlug`). Documents may carry `schemaVersion`; they are upgraded like a read. |
| `GET` | `/site` | | The site document |
| `PUT` | `/site` | `site.json` | The saved site document |
| `GET` | `/pages` | | `{ pages: [{ slug, title, file, anchors }] }` |
| `POST` | `/preview` | `{ page, motion? }` | `{ html }`. Validates the draft and renders it. Does not write. |
| `POST` | `/pages` | `{ slug, title, template? }` | `201` and the new page |
| `GET` | `/pages/:slug` | | The page document |
| `PUT` | `/pages/:slug` | Full page JSON. `slug` must match the URL | The saved page |
| `DELETE` | `/pages/:slug` | | `{ deleted: true, slug }` |
| `POST` | `/pages/:slug/rename` | `{ slug }` | The renamed page. Refuses `index`. |
| `POST` | `/pages/:slug/set-home` | `{ previousSlug? }` | The page, now saved as `index`. When a home page exists, `previousSlug` is required: the old home moves to that slug. `409` on a clash. |
| `GET` | `/images` | | `{ images: [{ filename, path }] }` |
| `DELETE` | `/images/:filename` | | `{ deleted: true, filename }`. `404` for an unknown name or anything that is not a plain image file in the uploads directory. `409` `{ error: 'in_use', message, usages }` while `site.json` or a saved page points at the file; `usages` reads like `Home page › Hero` or `Site settings › brand logo`. |
| `POST` | `/images` | multipart field `file` | `201` `{ filename, path, bytes }` |

`POST /pages` without `template` inserts one hero section (or the first registered section) using that type's design-system defaults, including the default `variant` and `tone` from the section's options. `template` may be any registered section type (`hero`, `logoStrip`, `features`, `textImage`, `stats`, `testimonials`, `pricing`, `faq`, `cta`, `contact`), which inserts that type's defaults, or an existing page slug, which copies that page's sections. A section type wins when a slug and a type share a name. The new file is `content/pages/<slug>.json`.

`GET /schema` is read-only. It returns the same option catalog the schemas use, so an editor sidebar can build its forms without importing the package. Writes are still checked against those schemas: every variant, tone, motion flag, `yearlyDiscount`, heading `marks`, `nameMarks`, link `newTab` / `id` / `trackingId`, and `footer.badge` is accepted, and values outside the catalog are rejected. A legacy `nameEm` or heading `em` is migrated on write.

`POST /preview` returns `501` when the dev server has no preview renderer. A schema failure is `400` and the content files are left untouched. The starter's renderer is `src/lib/render-preview.ts`, loaded by the Vite SSR runner.

`POST /preview/site` takes `{ site, pathname }`, validates the draft site, and returns `{ header, footer }` HTML from the theme preview's `site` renderer. The editor calls it (debounced) for brand, header layout, header link and footer layout edits made in the sidebar, then swaps the two elements in place; text typed on the page is not re-rendered, so the caret stays. It returns `501` when the theme defines no `site` renderer. The mobile menu's script is not re-attached after a swap, so reload to test it.

`POST /images` returns `path` relative to the project root, using forward slashes, for example `src/assets/uploads/hero-a1b2c3d4.png`. Store that string on an image field (`src` plus `alt`, and optionally `fit`: `cover` | `contain` | `auto`, and `position`: a CSS keyword pair such as `top left`. Both are omitted at their defaults, cover and center. `auto` makes the frame take the image's own aspect ratio): hero `image`, logo-strip `logos`, feature `items[].image`, text-and-image `image`, testimonial `items[].image`, and `site.logo`. The starter resolves any `src` that starts with `src/assets/`. During `astro dev`, a file the eager glob has not picked up yet is served from `GET /__bearminion/assets?src=src/assets/...`; when the file is gone, that route answers `404` with an SVG that says Missing image and names the file, so the page shows the gap instead of a broken-image icon. Every save checks that each `src/assets/...` path in the page and the site exists and fails validation (`400`, one issue per path, such as `sections.0.props.image.src`) when one does not. A production build still fails on a missing file.

`DELETE` and rename both refuse slug `index` with `409`, so the home page stays at `/`. Rename writes the new file, then removes the old one. `PUT` keeps the existing filename and returns `400` if the body slug does not match the URL.

Other status codes: `404` missing document, `409` duplicate slug or a protected `index` page, `413` body too large, `415` unsupported image, `422` a file already on disk does not match the schema.

From `templates/default` with `pnpm dev` (Astro's default is port 4321):

```bash
curl -s http://127.0.0.1:4321/__bearminion/api/schema
curl -s http://127.0.0.1:4321/__bearminion/api/site

curl -s -X PUT http://127.0.0.1:4321/__bearminion/api/site \
  -H 'content-type: application/json' \
  --data-binary @content/site.json

curl -s http://127.0.0.1:4321/__bearminion/api/pages
curl -s http://127.0.0.1:4321/__bearminion/api/pages/index

# Save a page and the site together, as the editor does.
curl -s -X POST http://127.0.0.1:4321/__bearminion/api/save \
  -H 'content-type: application/json' \
  -d "{\"page\":{\"from\":\"index\",\"document\":$(cat content/pages/index.json)},\"site\":$(cat content/site.json)}"

curl -s -X POST http://127.0.0.1:4321/__bearminion/api/pages \
  -H 'content-type: application/json' \
  -d '{"slug":"notes","title":"Notes","template":"hero"}'

curl -s -X PUT http://127.0.0.1:4321/__bearminion/api/pages/notes \
  -H 'content-type: application/json' \
  --data-binary @content/pages/notes.json

curl -s -X POST http://127.0.0.1:4321/__bearminion/api/pages/notes/rename \
  -H 'content-type: application/json' \
  -d '{"slug":"field-notes"}'

curl -s -X DELETE http://127.0.0.1:4321/__bearminion/api/pages/field-notes

curl -s -F file=@src/assets/logo.png http://127.0.0.1:4321/__bearminion/api/images
curl -s http://127.0.0.1:4321/__bearminion/api/images
```

`curl` does not send `Origin`. The dev server still checks that the TCP connection is local, so these commands work on the machine running `astro dev` and fail from another host.


## History and git

- `.editor/history/` keeps the newest 50 saved versions per page and for the site. Add it to `.gitignore`. To clear it, stop the dev server and delete the `.editor` folder.
- `bearminion({ git: true })` enables `GET /git` and `POST /git/commit` (`{ message, paths? }`). Only changed files under `contentDir` and `uploadsDir` can be committed, git runs without a shell, and there is no push. With `git` off, or outside a repo, the editor hides Commit changes….
