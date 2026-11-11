---
'bearminion': minor
'create-bearminion': minor
---

Add Markdown collections to the editor API (experimental): `collections: { blog: collection({ schema, path: 'src/content/blog/{slug}.md' }) }` lets the editor API list, read, create, save, rename and delete the entries of an existing Astro content collection, validated with the site's own Zod schema. A save rewrites only the frontmatter keys and body blocks that changed, so an unchanged entry produces no diff. Rename and delete are off unless enabled. Store keys with a leading slash now address the project root (`/src/content/blog/en/post.md`), which the file store and `githubStore` both support.
