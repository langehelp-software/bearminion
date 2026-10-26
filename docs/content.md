---
title: Content files
description: "Where BearMinion content lives, the shape of site.json and page files, and how content is migrated when a schema changes."
---

Where content lives, the shape of `site.json` and page files, and how schema changes are migrated. Read this to edit JSON by hand or to understand what the editor writes.

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
- `seo` — site defaults: optional `titleTemplate` (`%s` is replaced with the page SEO title), `description`, and `ogImage`, plus optional `jsonLd`: JSON-LD blocks (up to 10, 50 KB in all) that the default template adds to every page, usually an `Organization` and a `WebSite` (see [Site JSON-LD](#site-json-ld))
- `analytics` — optional raw HTML snippets: `head` (added at the end of `<head>`) and `bodyEnd` (added before `</body>`), 20,000 characters each. The default template renders them in the live site's build only: not in `astro dev`, and not in Vercel or Netlify preview deployments (see [Analytics](../templates/default/README.md#analytics)). They are not sanitised: the site owner is trusted, so keep write access to `site.json` to people you would trust with the site's code.
- `consent` — optional, the cookie banner. `enabled: false` switches it off; absent means on. `reopen` is `footer` (a link in the footer, the default) or `icon` (a small fixed cookie icon in the bottom-left corner that appears once the banner is closed). While the build includes analytics snippets and the banner is on, the template holds the snippets back until the visitor accepts (see [Cookie banner](../templates/default/README.md#cookie-banner)). Optional texts: `title` (80 characters), `body` (400), `accept` and `reject` (30 each), `settings` (the footer link's text, or the icon's label, 40), `policyLabel` (40) and `policyHref` (a path on the site, a `#anchor` or an `http(s)` address). Each falls back to the default the library exports as `consentCopy()`.
- `favicon` — optional `{ src, alt }`, the browser tab icon. A legacy `logo` key is read as `favicon` and stored under the new name.
- `brandLogo` — optional `{ src, alt, height? }`. Shown in the header and footer instead of the name; `height` is 16–64 px (28 when omitted). The icon box beside the name is gone: the brand is either the name or this image.
- `theme.mode` is `light` or `dark`. A legacy `system` reads as `light`.
- `theme` — `mode` (`light`, `dark`, or `system`, default `light`) and `motion` (default `true`)
- `header` — `variant` (`bar`, `centered`, `floating`), `tone`, `sticky`, `links`, and and `actions`, up to two header buttons shown left to right (the last is the primary button; an empty list hides them). Older `cta` and `signIn` fields are still read, as `signIn` then `cta`, and are rewritten as `actions` on the next save
- `footer` — `variant` (`simple`, `columns`, `wordmark`), `tone`, optional `text`, `legal`, and `badge` (the columns pill), and up to three `columns` of `{ title, links }`

## Pages

Each `content/pages/*.json` file:

- `slug`, `title`
- `seo` — `title`, `description`, optional `ogImage`, `noindex` (default `false`), `nofollow` (default `false`), optional `canonical` (absolute URL or site-relative path), optional `jsonLd` (up to 10 JSON-LD objects, 50 KB in all; the default template renders them in place of its generated `WebPage` markup, and still adds the site's own blocks)
- `sections` — ordered `{ id, type, variant, tone, motion?, props }`

The `404` page is a system page: the editor lists it apart, edits its content, and refuses to create, delete, rename or promote it, and the starter serves it as `/404.html`. Section `id`s are unique within a page. `props` are checked against the Zod schema registered for `type`; [Sections](sections/README.md) lists each type, its layouts and what it holds. `variant` and `tone` default per type (`tone` defaults to `base`). Headings stay plain strings. `marks` styles ranges inside `heading` the same way `nameMarks` styles the wordmark. A legacy `em` substring is accepted on input and stored as one serif italic mark. Links are `{ label, href, newTab?, id?, trackingId?, style? }`. `style` is `primary`, `secondary` or `tertiary` and applies to section buttons; the editor's link popover sets it, and leaving it unset keeps the look each section was designed with. `newTab` forces `target="_blank"` and `rel="noopener noreferrer"`. `id` is a lowercase slug, unique on the page, and it cannot match a section anchor. `trackingId` is still accepted and rendered as `data-analytics` when present in the JSON, but the editor no longer shows a field for it.

### Site JSON-LD

`site.seo.jsonLd` holds structured data for the whole site. The default template emits every block on every page, one script tag per block. The field is optional, so existing sites need no migration.

By convention the blocks use these `@id` values, with the site `url` minus any trailing slash:

- `<url>/#organization` for the `Organization`
- `<url>/#website` for the `WebSite`

When the site has a block with one of those ids, the generated `WebPage` block points at it: `isPartOf` becomes `{ "@id": "<url>/#website" }` and `publisher` becomes `{ "@id": "<url>/#organization" }`. Without them the `WebPage` keeps its inline `WebSite`.

A page's own `seo.jsonLd` replaces only the generated `WebPage` block, never the site's blocks. If a page block and a site block have the same `@id`, the block is emitted once, and the page's copy wins.

```json
{
  "seo": {
    "jsonLd": [
      { "@context": "https://schema.org", "@type": "Organization", "@id": "https://example.org/#organization", "name": "Example", "url": "https://example.org/" },
      { "@context": "https://schema.org", "@type": "WebSite", "@id": "https://example.org/#website", "name": "Example", "url": "https://example.org/", "inLanguage": "en" }
    ]
  }
}
```

The library exports `siteJsonLdIds`, `mergeJsonLd`, `hasJsonLdId` and `generateSiteJsonLd` for themes that build their own markup.

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

The starter uses this itself. Content version 2 folded its Video section into Media: `migrations[1]` turns a `video` section into a `media` section of kind `video` (`intro` becomes `body`, the `framed` layout becomes `centered`, an empty `placeholder` link is dropped). Sites created before that keep working, and their files are rewritten at version 2 the next time they are saved. Version 3 removed the Contact section's `action`, `format` and `turnstile`: `migrations[2]` drops them from every `contact` section, because the form now always posts to `/api/contact` and its keys live in code and the environment (see [Forms](forms.md)).

## Sections the site no longer defines

A page can hold a section whose `type` the site stopped defining (a section directory was removed or renamed). The site cannot draw it, so the build fails on it, by design. The editor still has to open the page and let you fix it:

- The editor API validates a page with the tolerant schema: a section with an unregistered `type` and a valid `id` is kept as it is, with any `props` and extra keys. Registered sections are validated in full.
- `PUT /pages/:slug` keeps an orphan the stored page already has, and refuses a new or retyped one (`400`, path `sections.N.type`).
- The preview leaves orphans out (`withoutOrphanSections`), and the section panel shows the section as "Unknown (type)" with a Delete button.
- `loadContent(dir, model, { tolerateOrphans: true })` and `contentCollections(model, { tolerateOrphans: true })` accept them for config and dev. Without this, `astro dev` exits at startup and the editor never opens. The starter turns it on in `astro.config.ts`, and in `content.config.ts` for dev only (`import.meta.env.DEV`), so `astro build` stays strict.
- With the dev option on, collection entries can hold orphans, so render pages through `withoutOrphanSections(page, registry)`. The starter's `lib/content.ts` does.
