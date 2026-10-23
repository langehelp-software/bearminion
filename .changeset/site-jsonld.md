---
"bearminion": minor
"create-bearminion": patch
---

Sitewide JSON-LD. `site.seo.jsonLd` is optional (up to 10 blocks, 50 KB, so no migration) and the default template emits its blocks on every page. A page's own `seo.jsonLd` still replaces only the generated `WebPage` block, and a block with the same `@id` is emitted once, the page's first. With the conventional ids `<url>/#organization` and `<url>/#website` in the site's blocks, the generated `WebPage` gets `isPartOf` and `publisher` as `@id` references. The Site tab has a Structured data group with an Edit JSON-LD dialog and a Generate button that fills an `Organization` and a `WebSite` from the site name, address and language, replacing blocks with the same `@id`. The logo is added only for a full https address. A warning shows while the site address is still `example.com`. `siteJsonLdIds`, `mergeJsonLd`, `hasJsonLdId`, `generateSiteJsonLd`, `upsertJsonLd` and `isPlaceholderSiteUrl` are exported; themes that emit JSON-LD should use `mergeJsonLd` (see the theme docs).
