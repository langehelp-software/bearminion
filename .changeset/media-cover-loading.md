---
"create-bearminion": patch
---

The Media section's video cover is a responsive image (a WebP `srcset` from 480 to 1920 pixels wide), so a phone no longer downloads the full-size poster, and it loads at once instead of lazily when the section is one of the first two on the page, where it is often the largest thing on screen.
