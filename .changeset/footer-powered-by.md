---
'bearminion': minor
'create-bearminion': minor
---

The starter footer shows a "Powered by BearMinion" link to bearminion.com, and the Footer tab can switch it off.

- New `poweredBy` option in `defineSite({ footer })` (default false). When a theme enables it, the Footer tab gets a **Powered by BearMinion** switch and `site.json` accepts `footer.poweredBy`. The link is shown unless the value is `false`.
- The starter adds `atoms/PoweredBy.astro` and renders it in the bottom row of every footer variant. Existing sites are not changed: copy `Footer.astro` and `PoweredBy.astro` (`npx bearminion status` lists them as outdated) and add `poweredBy: true` to `site-definition.ts` to get it.
