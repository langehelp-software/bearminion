---
"bearminion": minor
"create-bearminion": minor
---

Full-screen mobile menu: `defineSite({ header: { fullscreenMenu: true } })` adds a switch under Navigation → Header layout and allows `header.fullscreenMenu` in `site.json`. The starter offers it (off by default): the menu covers the screen, the header bar stays on top, the page stops scrolling, and Escape closes it. Existing sites copy `Header.astro`, `MobileMenu.astro` and the `site-definition.ts` line from the starter to get it.
