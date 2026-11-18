---
"bearminion": minor
"create-bearminion": minor
---

Section spacing: every section gets **Top spacing** and **Bottom spacing** in the editor's Layout group, keeping 0, ½ or 1 of the section's own padding. They are saved as `spaceTop` / `spaceBottom` (`none` or `half`); a section without them keeps its padding as before, so existing pages do not change. The control shows only on sites whose sections render it: run `npx bearminion add <section>` to update untouched section files, which brings the new `SectionShell` with them. A custom layout with its own padding adds `section-space` and the same values as `[--section-pt:…]` / `[--section-pb:…]`.
