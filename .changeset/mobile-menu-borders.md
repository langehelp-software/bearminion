---
"create-bearminion": patch
"bearminion": patch
---

Starter: the mobile menu draws no lines between items, so a link with a dropdown no longer stacks borders, and links under a parent sit closer together. `MobileBranch.astro` is not a file `add` updates: in an existing site, remove `border-b border-[var(--line)]` from its outer `div` by hand.

The floating header's menu panel opens 8px below the pill and as wide as it, instead of touching its border and sitting 20px narrower: the pill's `backdrop-filter` made it the panel's containing block. In an existing site, change `inset-x-5 top-full` to `inset-x-0 top-[calc(100%+0.5rem)]` in `MobileMenu.astro`.
