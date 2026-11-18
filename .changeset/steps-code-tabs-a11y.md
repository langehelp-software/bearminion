---
"bearminion": patch
"create-bearminion": patch
---

Accessibility fixes in two starter sections. Steps (`keys` layout) reads a shortcut such as `Ctrl+S` from its keycaps instead of an `aria-label` on a plain element, which screen readers may ignore. Code tabs' panels are plain elements with the tab panel role, since a figure with a caption cannot take that role. Update untouched files with `npx bearminion add steps` and `npx bearminion add code-tabs`.
