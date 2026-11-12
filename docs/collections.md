---
title: Markdown collections
description: "Edit an existing Astro content collection (Markdown with frontmatter and a Zod schema) through the BearMinion editor API: configuration, routes, what a save changes and what it never touches."
---

> **Experimental.** This page covers the API. There is no collection editor in the browser yet: the routes below are what it will be built on, and what a script or an assistant can call today.

A collection is a folder of Markdown files with frontmatter, such as `src/content/blog/en/*.md`, that your site already reads through `defineCollection`. BearMinion edits those files in place, using the schema you already have. Pages and sections are independent: a site can use collections without converting anything to sections.

## Configure

```ts
import bearminion from 'bearminion/astro'
import { collection } from 'bearminion'
import { blogSchema } from './src/content/schemas'

bearminion({
  // sections, site, ...
  collections: {
    'blog-en': collection({
      schema: blogSchema,
      path: 'src/content/blog/en/{slug}.md',
      label: 'Blog (English)',
      rename: false, // default: an entry's address cannot be changed
      delete: false, // default: entries cannot be deleted
    }),
  },
})
```

- `path` is a folder, then `{slug}`, then `.md` or `.mdx`. It is relative to the project root. A bad template fails when the config loads. Folder-per-entry layouts (`{slug}/index.md`) are not supported.
- The id (`blog-en`) is lowercase kebab-case. Use one collection per language: separate paths, separate slugs, and pairing through a field of your own schema (`translationKey`). Nothing in the editor assumes one language.
- `rename` and `delete` default to **off**, unlike pages. An existing site's addresses carry search ranking, so changing them is opt-in. A locked operation is refused by the API (`409 operation_locked`), whoever asks.
- The same option exists on `createHostedContext({ collections })`, imported from `bearminion/hosted`.

### The schema

`schema` is the Zod schema `content.config.ts` uses, so there is one definition. Two requirements:

1. **Put it in a plain module.** `content.config.ts` imports `astro:content`, which does not exist in a Worker or function. Export the schema from a module that imports only `zod`, and import it from both places.
2. **Astro's `image()` needs the factory form.** `image()` resolves files through Vite and cannot run outside Astro. Write the schema as `({ image }) => z.object({ cover: image().optional() })`, which Astro accepts too. BearMinion passes its own `image`: a string path, marked so the editor can offer the uploader. A schema without `image()` can be a plain `z.object`.

The editor reads Zod 4, the version Astro 7 ships.

The schema describes the form (`GET /collections` returns one entry per top-level field, as JSON Schema) and **validates every save**, with your own messages, before anything is written. The form is advisory: refinements and transforms are invisible to it, so the real parse is what decides. A field the schema cannot describe (`z.custom()`, for example) is returned read-only, never dropped, and a save leaves it as it was. Dates (`z.coerce.date()`) are edited as `YYYY-MM-DD` text. Frontmatter is read as Astro reads it, so an unquoted `2026-01-05` is a date.

## What a save changes

The rule: **an entry you open and save unchanged produces no diff, and an edit changes only what you edited.** A review of the commit reads as the edit.

- **Frontmatter.** Only the keys in the request are rewritten, in place. Comments, key order, spacing, folded text, quote style, flow lists and the file's line endings stay as they were. A key that uses a YAML anchor, alias or merge key is refused (`409 read_only_field`) and has to be edited by hand.
- **Body.** The body is a list of top-level blocks (paragraphs, headings, lists, quotes, code, tables, rules). A block you did not touch is written back as its original text, byte for byte, including the blank lines between blocks. Only edited and new blocks carry new text.
- **Locked blocks.** HTML, MDX components and `import` lines, footnotes, link reference definitions, directives (`:::note`) and any paragraph that contains one of those inline are returned with `editable: false`. They pass through untouched, and a request that tries to replace one is refused (`409 block_locked`).
- A request that changes nothing writes nothing: no commit.

BOMs, CRLF files and a missing final newline are preserved.

## Routes

Under the editor API (`/__bearminion/api` locally, or wherever you mount `handleHostedRequest`). All writes are validated first; a schema failure is `400 { error: 'validation', issues: [{ path, message }] }` and nothing is written.

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| `GET` | `/collections` | | `{ collections: [{ id, label, path, rename, delete, fields }] }`. `fields` is `[{ name, required, schema, readOnly }]`, or `null` for a schema that is not an object |
| `GET` | `/collections/:id/entries` | | `{ entries: [{ slug }], skipped: [filename] }`. `skipped` lists files whose names are not valid slugs |
| `POST` | `/collections/:id/entries` | `{ slug, fields?, body? }` | `201` and the new entry. `409` when the slug exists. `body` is Markdown |
| `GET` | `/collections/:id/entries/:slug` | | `{ slug, format, fields, blocks: [{ id, type, raw, editable }] }` |
| `PUT` | `/collections/:id/entries/:slug` | `{ set?, unset?, blocks? }` | The saved entry |
| `DELETE` | `/collections/:id/entries/:slug` | | `{ slug }`. `409` unless `delete: true` |
| `POST` | `/collections/:id/entries/:slug/rename` | `{ slug }` | `{ slug }`. `409` unless `rename: true` or when the new slug exists |

`PUT` is a patch:

```json
{
  "set": { "title": "New title", "tags": ["news", "release"] },
  "unset": ["subtitle"],
  "blocks": [
    { "id": "b0", "markdown": "Edited introduction." },
    { "id": "b1" },
    { "markdown": "A new paragraph." },
    { "id": "b3" }
  ]
}
```

`blocks` is the body in its new order: `{ id }` keeps a block, `{ id, markdown }` replaces it, `{ markdown }` adds one, and leaving an id out deletes that block. Block ids (`b0`, `b1`, ...) belong to the entry as it was read; read it again after a save. Dates in `fields` come back as `YYYY-MM-DD` when they are midnight UTC and as full ISO strings otherwise. Field names are limited to letters, digits, `_`, `-` and `.`.

Slugs are lowercase kebab-case, as for pages. The store key of an entry is built from the template and the validated slug only, never from request text.

## With a GitHub store

Every save is one commit. In `mode: 'pr'` each entry gets its own branch and pull request, `bearminion/collection/<id>/<slug>`, titled `Edit <id>: <slug>`; later saves to the same entry join it, and the base branch is never written. A hosted editor keeps no undo history: the repository is the history, as for pages. The local dev editor does not keep undo history for collections either; use git.

## Not yet

- The browser editor: forms from `fields` and a rich-text body over `blocks`.
- Uploads for an entry in PR mode (an image uploaded for a post lands in the `bearminion/uploads` pull request, which must merge first) and image paths relative to the Markdown file.
- A check that an image path in frontmatter exists.
- Titles in the entry list (one read per entry), and suggesting a slug from a title.
- A version check: two people saving the same entry means the last save wins, as for pages.
