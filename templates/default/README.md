# BearMinion site

The default BearMinion template, created with `npm create bearminion`. Astro and Tailwind render the JSON in `content/`, and while `npm run dev` runs, an inline editor writes that JSON back. `npm run build` writes a static site with no editor in it.

```bash
npm install    # if it was created with --no-install
npm run dev
```

Open the site, press Ctrl+E (Cmd+E on a Mac) for the sidebar, click any text to edit it, and Ctrl/Cmd+S to save. Commit `content/` and `src/assets/` like any other code; a host such as Vercel or Netlify builds the site from the repository.

| Script | What it does |
| --- | --- |
| `npm run dev` | Astro dev server with the editor |
| `npm run build` | Static site in `dist/`, no editor |
| `npm run preview` | Serves `dist/` |
| `npm run typecheck` | `astro check` |

This template is yours to change: it is the theme. `bearminion` is the only runtime package from this project, and it reads your section definitions, site definition and theme from `src/lib/content-model.ts`.

## Organisms and sections

| Layer | What it is | Where it lives |
| --- | --- | --- |
| Atoms | Typed primitives: typography, button, image | `src/components/atoms` |
| Molecules | Small compositions of atoms: section shell, section header, media frame, pill | `src/components/molecules` |
| Organisms | Static, site-wide and standalone UI | `src/components/organisms` |
| Sections | Page-content blocks stored in page JSON | `src/components/sections` |

Organisms are Header, Navigation, MobileMenu, and Footer. A modal, a dialog, and a cookie banner belong in this folder too. They are the chrome around every page (or a standalone widget), and they are fed by `content/site.json`.

Sections are `hero`, `logoStrip`, `steps`, `features`, `textImage`, `stats`, `testimonials`, `pricing`, `video`, `media`, `faq`, `cta`, and `contact`. Each page entry is `{ id, anchor?, type, variant, tone, motion?, props }`. `anchor` is an optional lowercase slug, unique on the page, and it becomes the section element's `id`. `data-section-id` stays the section id. `[data-section-id]` sets `scroll-margin-top: 7rem` so a sticky or floating header does not cover the target. `html` uses `scroll-behavior: smooth`, and `prefers-reduced-motion: reduce` forces `scroll-behavior: auto`. Section components are built from molecules and atoms. A section may use an organism when it needs one, such as a modal. The section root carries `data-section-id`, `data-section-type`, `data-variant`, `data-tone`, and `data-motion`. Atoms accept a `class` and forward `data-*` attributes, including `data-field`, so the editor can find the text.

Paragraph fields (`sub`, `intro`, `body`, `description`, `quote`, `note`, `thanks`, FAQ answers and Text + Image `points`) are markdown. The template renders bold, italic, inline `code` (a mono chip), links, and paragraphs through `bearminion/rich-text`, escapes every other character, and adds `rel="noopener noreferrer"` on `http` and `https` links.

```text
src/components/
  atoms/        Typography, Button, Image, LogoMark, Emphasis
  molecules/    SectionShell, SectionHeader, MediaFrame, Pill, CommandLine
  organisms/    Header, Navigation, MobileMenu, Footer, plus site-definition.ts (header and footer layouts, limits)
  sections/     one directory per type, plus definitions.ts, registry.ts, shared.ts, SectionList.astro
    hero/         definition.ts (zod schema, defaults, options), wireframe.ts (picker thumbnail), Hero.astro, Hero.stories.ts
    logo-strip/ steps/ features/ text-image/ stats/ testimonials/ pricing/ video/ media/ faq/ cta/ contact/
  seo/          Seo
```

`src/lib/content-model.ts` joins the section definitions and `organisms/site-definition.ts`. `astro.config.ts` passes it to `bearminion()` and `loadContent()`. A section directory holds everything about one type. See [Add a section type](#add-a-section-type) below.

## Add a section type

A section type is one directory under `src/components/sections/` plus three one-line registrations. This walks through a `quote` section: a pull quote with an attribution.

**1. The definition** (`quote/definition.ts`). The Zod schema validates the JSON and drives the editor's Content fields; `defaults` is what a new section starts with and must pass the schema.

```ts
import { z } from 'zod'
import { defineSection, richTextSchema, textSchema } from 'bearminion'
import { quoteWireframe } from './wireframe'

export const quoteSchema = z.object({
  quote: richTextSchema,
  name: textSchema,
  role: textSchema.optional(),
})

export type QuoteProps = z.infer<typeof quoteSchema>

export const quote = defineSection({
  type: 'quote',
  label: 'Quote',
  description: 'A pull quote with the name of the person who said it.',
  schema: quoteSchema,
  defaults: { quote: 'A short quote, in the words of the person who said it.', name: 'Alex Morgan', role: 'Role, Company' },
  variants: ['plain', 'card'] as const,
  defaultVariant: 'plain',
  // Props an author may clear. A test checks this list against the schema.
  optional: { props: ['role'] },
  wireframe: quoteWireframe,
})
```

**2. The picker thumbnail** (`quote/wireframe.ts`): rectangles in a 100 × 100 frame, `[left, top, width, height, kind]`.

```ts
import { defineWireframe } from 'bearminion'

export const quoteWireframe = defineWireframe([
  [14, 28, 72, 10, 'title'],
  [14, 44, 60, 6, 'text'],
  [14, 64, 24, 6, 'text'],
])
```

**3. The component** (`quote/Quote.astro`). Put `data-field` on every editable element, with the path into the page JSON, so the editor can find it.

```astro
---
import type { Section } from '../definitions'
import { renderRichText } from 'bearminion/rich-text'
import SectionShell from '../../molecules/SectionShell.astro'

interface Props {
  section: Extract<Section, { type: 'quote' }>
  index: number
  motion?: boolean
}

const { section, index, motion = true } = Astro.props
const field = (path: string) => `sections.${index}.props.${path}`
---

<SectionShell id={section.id} anchor={section.anchor} type={section.type} variant={section.variant} tone={section.tone} motion={section.motion ?? motion}>
  <figure class="section-container">
    <blockquote class="text-3xl" data-field={field('quote')} set:html={renderRichText(section.props.quote)} />
    <figcaption>
      <span data-field={field('name')}>{section.props.name}</span>
      {section.props.role && <span class="text-muted" data-field={field('role')}>{section.props.role}</span>}
    </figcaption>
  </figure>
</SectionShell>
```

**4. Register it** in three places:

- `sections/definitions.ts`: add `quote` to `sectionDefinitions`. This is the schema side, loaded by `astro.config.ts` and the editor, so it must not import `.astro` files.
- `sections/registry.ts`: add `quote: Quote`. The `satisfies Record<SectionType, unknown>` check fails until you do.
- `sections/SectionList.astro`: add a `case 'quote'` that renders `<Quote section={section} index={index} motion={motion} />`. The switch is what gives each component its exact section type.

Restart `npm run dev`. The section appears in the Add section picker, its fields in the sidebar, and `npm run typecheck` checks the component against the schema. Add a `Quote.stories.ts` next to it if you use Storybook.

Removing a section type later is safe: pages that still hold it open in the editor with an "Unknown" section you can delete, and `astro build` fails until they are cleaned up.

## Atoms

Design tokens (colors, fonts, and the semantic type scale) are declared in `src/styles/global.css`. Fonts and radii live in `@theme`. The tone colors (`bg`, `fg`, `muted`, `line`, `surface`, `accent`, `on`, `link`) live in `@theme inline`, so a section’s `[data-tone]` variables apply to `text-muted`, `bg-surface`, borders, and the other utilities. Inverse and brand text pairs meet WCAG AA. Atoms use those tokens through Tailwind utilities. Variant styles are built with `class-variance-authority`.

### Typography

`Typography.astro` renders the element named by `as` (`h1`–`h6`, `p`, `span`, `blockquote`, `div`, `li`, `figcaption`).

| Prop | Values |
| --- | --- |
| `size` | `display`, `display-center`, `display-editorial`, `h2`, `h2-lg`, `h3`, `lead`, `body`, `small`, `meta`, `eyebrow`, `mono`, `stat`, plus `xs`–`6xl` |
| `color` | `default`, `muted`, `accent`, `link`, `on` (the active tone) |
| `weight` | `regular`, `medium`, `semibold`, `bold` |
| `font` | `sans` (Bricolage Grotesque), `serif` (Instrument Serif), `mono` (JetBrains Mono) |
| `align` | `left`, `center`, `right` |
| `class` | Extra Tailwind classes, merged with `tailwind-merge` |
| `data-field` | Forwarded onto the element |

### Button

`Button.astro` renders an `<a>` when `href` is set, and a `<button>` otherwise. An `http` or `https` href opens in a new tab with `rel="noopener noreferrer"` unless `newTab` is `false`. `newTab` forces a new tab for any href. `id` and `data-analytics` are forwarded.

| Prop | Values |
| --- | --- |
| `variant` | `primary` (accent fill, optional arrow), `secondary` (inset line), `strong` (foreground on background), `ghost`, `text` |
| `size` | `sm` (2.5rem, used in the header), `md` (3rem), `lg` (3.25rem) |
| `arrow` | Appends a trailing arrow. Primary and text links opt in. |
| `href` | Present for links |
| `newTab` | Opens in a new window and sets `rel="noopener noreferrer"` |
| `class`, `data-field` | Forwarded onto the `<a>` or `<button>` |

Section JSON links are `{ label, href, newTab?, id?, trackingId? }`. The section component chooses the button variant. `trackingId` is rendered as `data-analytics`.

### Image

`Image.astro` uses Astro `<Image>` for files under `src/assets/` and a plain `<img>` for remote `http(s)` URLs. A `src/assets/...` path with no matching file throws at build time, with a message that says to restore the file or choose another image.

`MediaFrame.astro` is the image slot of a section: a frame with an aspect ratio, the image inside, or diagonal stripes and the alt text when there is no image yet. The slot's `data-field` sits on the frame, so the editor outlines and opens the whole frame, empty or not. The logo strip does the same on each logo's list item.

The site's own images (`logo.png`, `favicon.png`, `og.png`, `hero.png`) live in `src/assets/uploads/`, the editor's image library, so they can be picked again after you replace them. The library refuses to delete an image that a saved page or `site.json` still uses.

| Prop | Values |
| --- | --- |
| `src`, `alt` | `alt` is required (it may be an empty string) |
| `aspect` | `auto`, `square`, `video`, `4/3`, `4/5`, `3/2` |
| `fit` | `cover`, `contain` (CSS `object-fit`) |
| `rounded` | `none`, `md`, `lg`, `xl`, `2xl`, `3xl`, `full` |
| `loading` | `lazy` (default) or `eager` |
| `priority` | Loads the image eagerly |
| `sizes`, `widths` | Passed through to Astro Image for local files |
| `class`, `data-field` | Forwarded onto the `<img>` |

## SEO and sitemap

`Seo.astro` reads the page `seo` object and the site defaults in `site.json`. The document title is `seo.titleTemplate` with `%s` replaced by the page SEO title. Description falls back to the site description. The canonical URL is `seo.canonical` when set, otherwise the page path joined to `site.url`. Robots is `noindex` or `index`, plus `nofollow` or `follow`. Open Graph, Twitter, and WebPage JSON-LD use the same title, description, and image. A page that sets `seo.jsonLd` gets those blocks instead of the generated WebPage block, one script tag per block. `site.analytics.head` and `site.analytics.bodyEnd` are emitted by `Base.astro` in production builds only, behind the [cookie banner](#cookie-banner) unless it is switched off.

`astro.config.ts` sets `site` from `site.json` and adds `@astrojs/sitemap`. The filter keeps content pages whose `seo.noindex` is false. `content/pages/preview.json` is the sample noindex page: it is built, it emits `noindex`, and it is absent from the sitemap. `src/pages/robots.txt.ts` points crawlers at `sitemap-index.xml`.

The style guide at `/style-guide` renders every typography size and button variant. `/variants` renders every section, header, and footer variant. They live in `src/dev/` and only `npm run dev` serves them (the `devPages` integration in `astro.config.ts`), so they never reach the built site. Delete that integration and the folder if you do not want them.

## Analytics

`site.analytics.head` and `site.analytics.bodyEnd` are raw HTML snippets (the editor's Site → Analytics & scripts). `Base.astro` writes `head` at the end of `<head>` and `bodyEnd` before `</body>`, and only when `analyticsEnabled()` in `src/lib/analytics.ts` says the build is the live site's:

1. `BEARMINION_ANALYTICS=on` or `off` decides, when set. `1`, `true` and `yes` also mean on; `0`, `false` and `no` mean off.
2. Otherwise a production build is required, so `npm run dev` sends no visits.
3. Vercel (`VERCEL_ENV`) and Netlify (`NETLIFY`, `CONTEXT`) say which deployment is building, so only their production deployments include the snippets.
4. On any other host every production build includes them. Cloudflare Pages and similar hosts do not say which build is a preview. Set `BEARMINION_ANALYTICS=off` in the host's preview environment (Cloudflare lets you set variables per environment), or `on` to test a snippet locally with `npm run dev`.

People who only use the editor never set a variable: steps 2 and 3 cover the usual setup. The snippets are not sanitised, so give write access to `content/site.json` only to people you would trust with the site's code.

## Cookie banner

When snippets are set and `site.consent.enabled` is not `false`, `consentRequired()` in `src/lib/consent.ts` is true and the banner and the footer link render in every build, dev and previews included, so you see what visitors get. Only a build that ships the snippets (the rules above) holds them back; the others have none to hold. On the live build `Base.astro` changes three things:

- **Before any snippet:** an inline script sets Google Consent Mode v2 to `denied` for `ad_storage`, `ad_user_data`, `ad_personalization` and `analytics_storage`.
- **The snippets** move into `<template data-consent-snippet="head|body">`, so they are inert. Nothing in them loads or runs.
- **`ConsentBanner.astro`** is rendered, with a way to reopen it: a footer link (`ConsentLink.astro`, label `site.consent.settings`), or with `site.consent.reopen: "icon"` a fixed rounded cookie icon in the bottom-left corner (`data-consent-icon`, shown only while the banner is closed, labelled by the same text).

`src/lib/consent-client.ts` shows the banner when there is no stored choice, and keeps the choice in `localStorage` (`bm-consent`, 180 days, bump `CONSENT_VERSION` in `consent-store.ts` to ask everyone again). On accept it sends `gtag('consent', 'update', { analytics_storage: 'granted' })`, then rebuilds the held-back scripts into the page, so they run after the update and work for any vendor, not only Google. Withdrawing deletes `_ga`, `_ga_*`, `_gid` and `_gat*` on the host and its parent domains and reloads, because a loaded script cannot be unloaded. Cookies that other tools set are not cleared. The banner has one category, analytics, and Accept and Reject look the same on purpose.

In dev and previews the banner and its choices work, and nothing is loaded or sent, so your own testing stays out of the numbers. `<noscript>` fallbacks in `bodyEnd`, such as the Google Tag Manager iframe, cannot wait for consent and never run while the banner is on.

A theme with its own layout needs three things: render the `template` elements and a banner element carrying `data-consent-banner` (hidden by default) with `data-consent-accept` and `data-consent-reject` buttons, put `data-consent-open` on any element that should reopen it, and import `initConsent` from the script. The default words come from `consentCopy(site.consent)`, which `bearminion` exports.

## Dev editor

`astro.config.ts` registers `bearminion()`. It is active only while `pnpm dev` is running. The production build does not add editor routes, scripts, or the overlay.

The page gets a shadow-root overlay. Click text with `data-field` to edit it, and hover a section (`data-section-id`) for add, duplicate, move, and delete. The corner **Editor** button or Ctrl+E / Cmd+E opens the sidebar. Ctrl+S / Cmd+S saves. Escape leaves a field, then closes the add picker or the sidebar. Unsaved edits turn the corner dot amber and trigger a beforeunload warning.

A variant change, a new, duplicated, moved, or deleted section, and a sidebar value with no text of its own on the page (such as a video link) are re-rendered by `POST /__bearminion/api/preview`. The handler validates the draft, renders `SectionList` with Astro's container API inside the Vite SSR runner, and returns HTML. The overlay replaces `main#content` and runs scripts the page had not loaded, so a section type added from the picker works at once. A section script binds on load and again on the `bearminion:preview` event, and marks what it bound so it never binds twice. Nothing is written until save. In dev, an image path under `src/assets/` that is missing from the eager glob is served from `/__bearminion/assets` so a new upload can use a plain `<img>` immediately. When the file is gone, that route returns a Missing image placeholder instead, so the page shows the gap. Production still resolves that path with `import.meta.glob` and Astro `<Image>`, and still throws if the file is missing; the editor's save validation keeps content from pointing at a missing file.

Header links nest up to three levels (`MAX_NAV_DEPTH`). Desktop navigation uses hover and focus flyouts. The mobile menu uses an accordion. The link picker lists pages, `#anchor` on the current page, `/page#anchor` on other pages, and a custom URL.

The API is `/__bearminion/api` on localhost. Saving `content/*.json` asks the editor to reload. If the draft is still dirty, the editor asks to save, discard, or cancel first. Unsaved drafts are kept in `localStorage` until save or discard. An upload does not reload by itself, so the draft can preview the new file before save. Request and response shapes, with curl examples, are in the [Dev API docs](https://docs.bearminion.com/dev-api/), and every sidebar tab is described in [the editor docs](https://docs.bearminion.com/editor/).

```bash
pnpm dev
curl -s http://127.0.0.1:4321/__bearminion/api/pages
```

## Outside the BearMinion repository

Nothing in this folder points outside it. `package.json` asks for `bearminion` by version range, not `workspace:*`, so a copy installs with a plain `npm install`, `pnpm install` or `yarn`. In the BearMinion monorepo pnpm links that range to `packages/editor`.

To try unreleased changes from the monorepo, build a tarball with `pnpm --filter bearminion pack` and point the copy at it: `"bearminion": "file:/path/to/bearminion-1.0.0.tgz"`. CI does the same with the packed `create-bearminion` on every pull request.

The editor's end-to-end tests and this template's unit tests live in the monorepo's `tests/` package, not here.

<!-- storybook:start -->
## Storybook

Storybook uses `@storybook-astro/framework` (Storybook 10). It renders the `.astro` files on the server with Astro’s container API, so the components stay Astro. Tailwind and the design tokens come from `src/styles/global.css`, imported in `.storybook/preview.css`. The Tailwind Vite plugin is the one already set in `astro.config.ts`.

```bash
npm run storybook
npm run build-storybook
```

`storybook` opens the dev server at `http://localhost:6006`. Controls re-render Astro stories there. `build-storybook` writes a static site to `storybook-static/`. That build pre-renders each story with its saved args, and the Controls panel in the static site does not apply new values.

Stories live next to the component as `Component.stories.ts`. The `title` sets the sidebar group: `Atoms/Button`, `Molecules/SectionShell`, `Organisms/Header`, `Sections/Hero`. Props are `args`. Children go in `args.slots.default` (a string, another `.astro` component, or `{ component, props, slots }`). Named slots use the same shape. Section stories pass the matching block from `content/pages/index.json`.

```ts
import Button from './Button.astro'

export default {
  title: 'Atoms/Button',
  component: Button,
}

export const Playground = {
  args: {
    variant: 'primary',
    size: 'md',
    href: '/about',
    slots: { default: 'Read the approach' },
  },
}
```

A few limits of this renderer: Astro `<script>` tags are not run, so the mobile menu toggle works on the built site and the canvas shows the menu markup. Local images use Vite `/@fs` URLs, which resolve while `storybook dev` is running. Astro’s image optimizer still runs in `astro build`. The static Storybook output keeps those `/@fs` URLs, so image stories in `storybook-static` do not load the files on their own.
<!-- storybook:end -->
