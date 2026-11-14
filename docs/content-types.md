---
title: Content types
description: "Declare a blog, a news list or a fixed page in the content model: entries with their own fields, a sort order, a paginated listing page, and how to bring a site made before 1.21 up to it."
---

A content type is a kind of document your site has. Three are built in and need nothing from you: the **home page**, the **404 page** and **pages**. Declare more when some of your content is a list of alike things: posts, news, case studies, team members. You get a folder of JSON files, a list in the editor, an address for each entry and, if you want one, a listing page with pagination.

If all you have is pages, skip this page. Nothing here is on until you declare a type.

## Declare a type

Types go in the content model (`src/lib/content-model.ts` in the starter), next to `sections` and `site`:

```ts
import { defineTypes, multi, single } from 'bearminion'
import { z } from 'zod'

export const contentModel = {
  sections: sectionDefinitions,
  site: siteDefinition,
  types: defineTypes({
    blog: multi({
      path: '/blog/{slug}',
      fields: z.object({
        date: z.iso.date(),
        excerpt: z.string().max(200).optional(),
        draft: z.boolean().default(false),
      }),
      sections: ['text', 'media', 'cta'],
      sort: { by: 'date', order: 'desc' },
      listing: { perPage: 10 },
    }),
    about: single({ path: '/about' }),
  }),
}
```

That is the whole setup. There is no route file to add: the starter's one route draws every address. A mistake in the config (a clashing address, a sort field that does not exist) stops `astro dev` and `astro build` with the type and the option to fix.

## Many entries: `multi()`

| Option | What it does | Default |
| --- | --- | --- |
| `path` | Where an entry is served: one segment, then `{slug}` | `/<id>/{slug}` |
| `label` | The name in the editor | The id with a capital letter |
| `fields` | A `z.object({...})` of fields every entry has besides its title, SEO and sections | None |
| `sections` | The section types an entry may use | Every section |
| `sort` | `{ by, order }`: `by` is `title` or a field, `order` is `asc` or `desc` | Title, A to Z |
| `listing` | `false`, or `{ slug, perPage }` for a page that lists the entries | `false` |
| `rename` | Allow changing an entry's slug | `true` |
| `delete` | Allow deleting entries | `true` |

An entry is a page with `fields` added: the same title, SEO and sections, in `content/<id>/<slug>.json`.

**Sorting.** Sort by any field that every entry has: a date, a string, a number, a boolean or an enum. An optional field cannot be the sort field, because some entries would have no place in the order; the config says so. Entries with the same value are ordered by slug, so the order is the same on every build. Text is ordered in the site's language (Site settings, Language).

**Drafts.** Give the type a `draft: z.boolean().default(false)` field. An entry with it on shows in `astro dev` and in the editor, and is left out of the build, the listing and the sitemap.

**The built-in `pages` type** can be tuned the same way (`pages: multi({ sections: [...] })`), except for its `path` and a listing. It cannot be removed.

## One document at a fixed address: `single()`

`single({ path: '/about' })` is one document that always exists at one address. Editors change its content; nobody can rename or delete it. It takes `label`, `fields` and `sections` like a type with entries, and is stored in `content/singles/<id>.json`. Until it is saved once it shows its label and no sections.

The home page and the 404 page are singles that every site has. They stay in `content/pages/index.json` and `content/pages/404.json`.

## The listing page

`listing: {}` turns it on. `slug` is its address (default: the first segment of `path`, so `/blog`), and `perPage` is how many entries one page shows (1 to 100, default 10).

- Page 1 is at `/blog`, later pages at `/blog/page/2`, `/blog/page/3`.
- The listing has a document of its own, `content/<id>/_listing.json`: a title, SEO and sections, edited in the editor like a page. The sections are shown above the list on page 1 only.
- Each page has its own title ("Blog - Page 2") and its own canonical address, and is in the sitemap unless the listing is set to noindex.
- A type with no entries still has page 1, with an empty state.

The starter draws the list with two files that are yours: `src/components/organisms/EntryList.astro` (a card per entry: the title, plus `date`, `excerpt` and `cover` when the type has fields by those names) and `Pagination.astro`. A type with other fields: change `EntryList.astro`.

## Addresses that are taken

Every address belongs to one document. So:

- A page cannot be called like a type's first segment, a listing or a single (`blog`, `about`).
- An entry cannot be called `page` when its listing's page numbers live at `/blog/page/2`.
- Two types cannot share a segment.

The editor refuses these when a page or entry is created or renamed. Files made by hand that clash stop the build with both documents named.

## In the editor

Each type has its own list under Pages, with a New entry form. A title is enough: a required date starts as today. The type's fields are edited in a Fields group, the section picker offers only the sections the type allows, and listing pages and singles are edited like pages. See [The editor](editor.md).

## Types and Markdown collections

They solve different problems. A **content type** is for content that starts in BearMinion: JSON files, built from your sections, with a list and a form in the editor. A [Markdown collection](collections.md) is for an Astro collection you already have: Markdown files edited in place. A type and an Astro collection of your own cannot share a name, because each type becomes an Astro collection named by its id.

## The sitemap

The starter's `astro.config.ts` builds the sitemap from the site's routes, so entries and listing pages are in it:

```ts
import { siteRoutes } from 'bearminion'

const content = loadContent(contentDir, contentModel, { tolerateOrphans: true })
const routes = siteRoutes(contentModel, content, { locale: content.site.lang ?? 'en' })

sitemap({ filter: createSitemapFilter(routes) })
```

A config from before 1.21 passes `content.pages` there. It still works, and it leaves everything that is not a page out of the sitemap.

## Upgrading from 1.20

Updating the package changes nothing on a site that declares no types: the same pages, the same HTML, with the files you have.

To declare a type on a site made before 1.21, bring its own files up to date first:

```sh
npx bearminion add types --dry-run
npx bearminion add types
```

It updates the page route, `src/content.config.ts`, `src/lib/content.ts` and `src/lib/sitemap.ts`, and adds the two listing components. Files you did not change are replaced; a file you changed stops the command, and `--diff` shows how it differs. Your `astro.config.ts` is never edited: change the sitemap lines above by hand. More in [the CLI](cli.md#update-a-site-for-content-types).

If you declare a type without doing this, `astro build` stops and lists the addresses it could not write, and `astro dev` warns. It never builds a site that silently lacks its posts.

**"Set as home page" is gone.** The home page is a fixed page now, not a page promoted from the list. Your content is untouched: `content/pages/index.json` is still the home page. To change what visitors see first, edit its sections. To put another page's content there, swap the two files in git and set each file's `slug`.

## Limits

- An entry's address is one segment after the type's (`/blog/first-post`). Nested addresses are not supported, for types or for pages.
- There is no tag, author or archive page, and no RSS feed yet.
- The live preview of a listing page redraws its sections; the list of entries updates on save.
