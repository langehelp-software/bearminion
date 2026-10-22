---
"bearminion": minor
"create-bearminion": minor
---

Custom JSON-LD and analytics snippets. A page's `seo.jsonLd` holds parsed JSON-LD blocks that replace the generated `WebPage` markup, and `site.analytics` (`head`, `bodyEnd`) holds raw snippets the template emits on the live site only: not in `astro dev`, and not in Vercel or Netlify preview deployments. Nothing needs configuring; `BEARMINION_ANALYTICS=on|off` overrides the choice for hosts that cannot be told apart. The Pages tab shows an SEO card (search result preview and badges) with an Edit SEO button that opens a dialog for every SEO field, including JSON-LD with validation and script-tag unwrapping. The Site tab has an Analytics & scripts group. `parseJsonLdInput`, `formatJsonLd`, `jsonLdWarnings`, `jsonLdSchema` and `siteAnalyticsSchema` are exported. Themes need to render the two new fields (see the theme docs).
