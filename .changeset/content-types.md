---
'bearminion': minor
'create-bearminion': minor
---

Content types. This entry grows as the work lands; the release notes list everything.

- **The home page is a fixed page.** "Home page" is gone from the page form, and so are `POST /pages/:slug/set-home` and `previousHomeSlug` in `POST /save`. No page can be renamed to `index`. Nothing in your content changes: `content/pages/index.json` is still the home page. To change what visitors see first, edit the home page's sections. If you really want another page's content there, swap the two files in git and set each file's `slug`.
