---
title: Stats
description: "Big numbers with a short label under each."
sidebar:
  order: 8
  label: Stats
---

Big numbers with a short label under each.

**`row`** (default): the numbers in a ruled row.

![Stats, row layout: four large numbers with labels in a row.](../images/sections/stats-row.webp)

**`cards`**: each number in its own card.

![Stats, cards layout: four cards, each with a number and a label.](../images/sections/stats-cards.webp)

**`split`**: the heading on the left, the numbers in a grid on the right.

![Stats, split layout: heading on the left, four numbers in a two by two grid on the right.](../images/sections/stats-split.webp)

Content: `items` of `{ value, label? }`, four recommended. Optional: `eyebrow`, `heading` and `body`.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add stats
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
