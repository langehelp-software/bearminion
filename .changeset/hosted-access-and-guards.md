---
'bearminion': minor
'create-bearminion': minor
---

The hosted editor can now be limited to named people, and it warns when a site's own files are older than it needs.

- `auth: { allowedLogins: ['ann', 'bob'] }` narrows sign-in to those GitHub logins, on top of push access. It is checked at sign-in and on every request, so a login removed from the list is signed out at its next request. An empty list is refused.
- The editor build warns when a starter site has no `src/lib/editing.ts`, or when `src/pages/[...slug].astro` or `src/pages/404.astro` never reads `Astro.locals.bearminion`. A missing `editing.ts` makes a page answer 500 after an image is uploaded in the editor.
- Sites created before 1.16 do not get 1.16's fixes to `MediaFrame`, `Image`, `Seo`, `LogoStrip`, `env.d.ts` and the page routes from `npm update`. See "Keeping the site's files current" in the integration guide for the steps, then `npx bearminion@latest status`.
