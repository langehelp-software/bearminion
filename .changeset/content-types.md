---
'bearminion': minor
'create-bearminion': minor
---

Content types. This entry grows as the work lands; the release notes list everything.

- **The home page is a fixed page.** "Home page" is gone from the page form, and so are `POST /pages/:slug/set-home` and `previousHomeSlug` in `POST /save`. No page can be renamed to `index`. Nothing in your content changes: `content/pages/index.json` is still the home page. To change what visitors see first, edit the home page's sections. If you really want another page's content there, swap the two files in git and set each file's `slug`.
- **Content types in the editor API.** `types: defineTypes({ blog: multi({ path: '/blog/{slug}', fields, sort, listing }), about: single({ path: '/about' }) })` in the content model declares the site's own types next to the built-in home page, 404 page and `pages`. New routes: `GET /types`, `/types/:id/entries` (list, create, read, save, rename, delete), `/types/:id/listing` and `/types/:id/document`. `/pages` works as before. Deleting an image or video now also checks entries, listing pages and singles, and a page cannot take a slug that is the address of a type.
- **Migrations are told the type.** A `ContentMigration` receives the content type's id as a third argument. Existing migrations need no change.
- **Routing for types.** `siteRoutes(model, content)` lists every address of the site with what it shows (pages, singles, entries, and each listing page with its entries and pagination), `findRoute` picks one, and the hosted editor's `content.getRoute(pathname)` answers the same for one address from the repository. `loadContent()` also returns `entries`, `listings` and `singles`, and `contentCollections()` returns the extra collections under `types`. A site without `types` gets what it got before: two collections, the same pages.
