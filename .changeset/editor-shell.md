---
"bearminion": minor
"create-bearminion": minor
---

The editor is now a shell around the page: a navigation on the left (Pages, every content type, Media, Navigation, Footer, Site, Design, SEO) that collapses to an icon rail with Ctrl/Cmd+\, a top bar with the breadcrumb, undo and redo, version history, the unsaved changes, Preview and Save, and a resizable inspector on the right with the Page and Section tabs. The page itself is still where you edit.

- Content listings: every page and every entry of a content type in a table with search, Published, Draft and Unsaved tabs, sorting, bulk delete, duplicate, view and ten rows a page. `GET /pages` and the entries of a type also return `draft`, `noindex` and `updatedAt`.
- Media: the image library with where each image is used, upload and delete. `GET /images?usage=1` returns the uses.
- Navigation, Footer, Site, Design and SEO are full screens with a card per group. Search defaults moved from Site to SEO.
- SEO: the site's structured data is edited inline, one card per JSON-LD block, instead of in a dialog. New Indexing switches turn search engines (`site.seo.robots`) and `sitemap.xml` (`site.seo.sitemap`) off for the whole site. A site created earlier needs three small edits to its own `Seo.astro`, `robots.txt.ts` and `astro.config.ts` for them to take effect: see the editor docs.
- Pages have a status: a draft (`"status": "draft"`) is left out of the build, the listings and the sitemap, and still shows in `astro dev`. Files without a status stay published, and no file of your site needs to change for this.
- Tablet and mobile frames show the unsaved draft at 820px and 390px.
- The dock and the Save menu are gone: undo, redo, history, discard and commit live in the top bar.
