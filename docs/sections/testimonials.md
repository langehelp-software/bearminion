---
title: Testimonials
description: "Quotes with a name, a role and an optional avatar."
sidebar:
  order: 9
  label: Testimonials
---

Quotes with a name, a role and an optional avatar.

**`grid`** (default): the quotes as cards in columns.

![Testimonials, grid layout: three quote cards side by side.](../images/sections/testimonials-grid.webp)

**`featured`**: one large quote, with the others in a row below.

![Testimonials, featured layout: one large quote on top and two smaller quotes below.](../images/sections/testimonials-featured.webp)

**`carousel`**: one quote at a time, with a portrait, a counter and previous and next buttons.

![Testimonials, carousel layout: one quote beside a portrait, with a counter and arrows.](../images/sections/testimonials-carousel.webp)

Content: `items` of `{ quote, name, role?, image? }`, three recommended. Optional: `eyebrow` and `heading`.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add testimonials
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
