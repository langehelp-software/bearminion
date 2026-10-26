---
title: Dev API
description: "The localhost HTTP API the BearMinion editor uses during astro dev, with every route and curl examples."
---

The localhost HTTP API the editor talks to during `astro dev`. Every route is validated against the site's schemas and refuses non-local requests.

Base path: `/__bearminion/api`. Only loopback clients are accepted. `Host` must be `localhost`, `127.0.0.1`, or `::1`. If `Origin` is present, its host must be one of those too. If the browser sends `Sec-Fetch-Site`, it must be `same-origin` or `none`, which also stops a no-cors GET from another site (it carries no `Origin`). The TCP peer must be loopback (`127.0.0.1`, `::1`, or `::ffff:127.0.0.1`). Anything else is `403` and the handler does not read or write files.

Slugs are lowercase kebab-case. Encoded `..`, slashes, and backslashes are rejected. Upload filenames are reduced to a safe stem, then stored with a random suffix and an extension taken from the sniffed image type.

JSON bodies are limited to 1MB. Images are limited to 5MB and must be png, jpeg, webp, gif, or avif, with a matching `Content-Type` and file signature. Videos are limited to `maxVideoBytes` (50MB by default) and must be mp4, webm, mov or ogv, checked the same way.

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
| `GET` | `/videos` | | `{ videos: [{ filename, path, url, bytes }], maxBytes }` |
| `POST` | `/videos` | multipart field `file` | `201` `{ filename, path, url, bytes }`. `url` is the address on the site, such as `/videos/demo-1a2b3c4d.mp4`, and is what a Media section's `video` field holds. `404` when the store takes no videos. |
| `DELETE` | `/videos/:filename` | | `{ deleted: true, filename }`. `409` `{ error: 'in_use', message, usages }` while saved content links the video. |

`POST /pages` without `template` inserts one hero section (or the first registered section) using that type's design-system defaults, including the default `variant` and `tone` from the section's options. `template` may be any registered section type (`hero`, `logoStrip`, `features`, `textImage`, `stats`, `testimonials`, `pricing`, `faq`, `cta`, `contact`), which inserts that type's defaults, or an existing page slug, which copies that page's sections. A section type wins when a slug and a type share a name. The new file is `content/pages/<slug>.json`.

`GET /schema` is read-only. It returns the same option catalog the schemas use, so an editor sidebar can build its forms without importing the package. Writes are still checked against those schemas: every variant, tone, motion flag, `yearlyDiscount`, heading `marks`, `nameMarks`, link `newTab` / `id` / `trackingId`, and `footer.badge` is accepted, and values outside the catalog are rejected. A legacy `nameEm` or heading `em` is migrated on write.

`POST /preview` returns `501` when the dev server has no preview renderer. A schema failure is `400` and the content files are left untouched. The starter's renderer is `src/lib/render-preview.ts`, loaded by the Vite SSR runner.

`POST /preview/site` takes `{ site, pathname }`, validates the draft site, and returns `{ header, footer }` HTML from the theme preview's `site` renderer. The editor calls it (debounced) for brand, header layout, header link and footer layout edits made in the sidebar, then swaps the two elements in place; text typed on the page is not re-rendered, so the caret stays. It returns `501` when the theme defines no `site` renderer. The mobile menu's script is not re-attached after a swap, so reload to test it.

`POST /images` returns `path` relative to the project root, using forward slashes, for example `src/assets/uploads/hero-a1b2c3d4.png`. Store that string on an image field (`src` plus `alt`, and optionally `fit`: `cover` | `contain` | `auto`, and `position`: a CSS keyword pair such as `top left`. Both are omitted at their defaults, cover and center. `auto` makes the frame take the image's own aspect ratio): hero `image`, logo-strip `logos`, feature `items[].image`, text-and-image `image`, testimonial `items[].image`, and `site.logo`. The starter resolves any `src` that starts with `src/assets/`. During `astro dev`, a file the eager glob has not picked up yet is served from `GET /__bearminion/assets?src=src/assets/...`; when the file is gone, that route answers `404` with an SVG that says Missing image and names the file, so the page shows the gap instead of a broken-image icon. Every save checks that each `src/assets/...` path in the page and the site exists and fails validation (`400`, one issue per path, such as `sections.0.props.image.src`) when one does not. A production build still fails on a missing file.

`DELETE` and rename both refuse slug `index` with `409`, so the home page stays at `/`. Rename writes the new file, then removes the old one. `PUT` keeps the existing filename and returns `400` if the body slug does not match the URL.

Other status codes: `404` missing document, `409` duplicate slug or a protected `index` page, `413` body too large, `415` unsupported image, `422` a file already on disk does not match the schema.

From your site with `npm run dev` (Astro's default port is 4321):

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
