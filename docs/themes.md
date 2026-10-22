---
title: Building a theme
description: "What a BearMinion theme supplies: section types, the header and footer definition, the theme contract, live preview and content collections."
---

What a theme supplies to `bearminion`: section types, the header and footer definition, the fixed theme contract, the live preview renderer and content collections. The default template is a complete example; its README walks through [adding a section type](../templates/default/README.md#add-a-section-type).

## Section registry

The package ships no section types. A site defines each one in its own directory and passes the set to `bearminion({ sections, site })`, `loadContent(dir, { sections, site })` and `loadPages(dir, sections)`. The starter's sections are `hero`, `logoStrip`, `features`, `textImage`, `stats`, `testimonials`, `steps`, `pricing`, `video`, `media`, `faq`, `cta` and `contact`, each with three variants, in `templates/default/src/components/sections/<name>/`:

```text
hero/
  definition.ts   zod schema, defaults, variants, extra options, optional props, item counts
  wireframe.ts    the thumbnail in the Add section picker, as rectangles
  Hero.astro      the component
  Hero.stories.ts Storybook
```

`definition.ts` calls `defineSection({ type, label, description, schema, defaults, variants, defaultVariant, options?, optional, counts?, wireframe, icons?, showWhen?, refine? })`. `variants` becomes the section's `variant` field and control, and `options` adds controls after variant, tone and motion. `optional` names the props an author may drop (a test checks it against the schema). `counts` holds list-length rules per array prop. `refine` holds rules the schema cannot express, such as a variant that needs an exact item count. `defaults` must already satisfy `schema`.

The sidebar reads the schema for two things. A string enum anywhere in `props`, a list item's field included, becomes a choice: a segmented control for up to four choices, a select for more. An object with `src` and `alt` is an image slot, whatever the prop is called. Fields are named by their place in `props`, with list items as `[]`: `steps[].icon`, `items[].image`.

`icons` draws the choices of a field as an icon grid. Give SVG path data on a 24 × 24 grid, drawn as a 1.8 stroke, for every choice:

```ts
icons: { 'steps[].icon': { terminal: 'M4 5h16v14H4zM8 10l2.5 2L8 14M12.5 14H16', edit: 'M4 20h4L19 9l-4-4L4 16z' } },
```

`showWhen` hides a prop in the sidebar while the section's options make it unused. Every option named must match; a list matches any of its values, and `variant`, `tone` and `motion` count as options. A hidden prop keeps its value in the file:

```ts
showWhen: {
  poster: { kind: 'video' },
  badge: { variant: ['split', 'centered'] },
  primary: { button: true },
},
```

`defineSection` throws when `icons` names a field without choices or misses a choice, or when `showWhen` names a prop, option or value that does not exist.

`wireframe.ts` is plain data, not a component: `defineWireframe([[left, top, width, height, kind], ...])` with percentages in a 100 × 100 frame and a kind (`title`, `text`, `block`, `button`, `outline`, `card`, `highlight`, `avatar`, `dark`, `light`, `figure`) that the editor draws in a fixed greyscale. It is plain data because the picker runs in the browser and cannot render `.astro`. `GET /schema` returns each section's wireframe and description, so the picker needs no knowledge of the section.

The starter lists its directories in `sections/definitions.ts` (no `.astro` imports, so `astro.config.ts` can load it) and `sections/registry.ts` (type → component). It derives its own `Section` and `Page` types from the registry with `SectionOf<typeof sectionDefinitions>`. Every configurable option has a `label`, a `type` of `enum` / `boolean` / `number` / `string`, `choices` and a `default`. In the starter, feature items are 3–6; in the bento layout four keep a wide fourth card and any other count fills rows of three. FAQ items are 4–8. A pricing plan `cta` is a link `{ label, href }`. `yearlyDiscount` defaults to `0.2`. A video `video` is a link to a video file (`.mp4`, `.webm`, `.m4v`, `.mov` or `.ogv`, as `https://…` or a path in `public/`) or `placeholder`; page links such as YouTube are refused. Its `playback` option is `controls` or `loop` (muted, plays while on screen, paused with reduced motion). A media `video` is a YouTube or Vimeo link or a video file link; it loads nothing until the visitor presses play, through youtube-nocookie.com or Vimeo with Do Not Track, and a YouTube video without a `poster` shows its own thumbnail. Its options are `kind` (`video` or `image`), `aspect` (`16:9`, `4:3`, `21:9`, `1:1`) and `intro` (show the heading). Steps take 2–6 items, each with an `icon` (`terminal`, `edit`, `upload`, `moon`, `git`, `check`, `bolt`, `cursor`, `sliders`, `database`), a `title` and a rich `description`, and a `numbered` option. The hero's `code` option shows its `command` with a copy button: `off`, `action` (in the button row, in place of the secondary button), `chip` or `terminal`. Its `button` option hides the primary button, and an optional `badge` (`tag`, `text`, `href`) takes the eyebrow's place in the split and centered layouts. The terminal CTA's `output` holds up to 8 lines `{ prompt?, text }` printed under its command. An empty Video or Media frame is an editor hint: built sites leave it out.

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

A theme also renders two optional content fields the library validates but cannot draw: `page.seo.jsonLd` (custom JSON-LD blocks, which replace whatever structured data the theme generates itself) `site.analytics` (`head` and `bodyEnd` HTML snippets, which the default template emits in production builds only) and `site.consent` (the cookie banner's switch and texts: `consentCopy(site.consent)` gives the words with the library's defaults). A theme that emits the snippets should hold them back until the visitor accepts unless `site.consent.enabled` is `false`; the default template shows how. A theme that ignores these fields silently drops what the editor saves. Escape `<` as `\u003c` when serialising JSON-LD into a script tag.

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
