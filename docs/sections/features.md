---
title: Features
description: "Cards with a title, a description and an optional picture."
sidebar:
  order: 5
  label: Features
---

Cards with a title, a description and an optional picture.

**`cards`** (default): the items as cards in a row.

![Features, cards layout: four cards, each with a picture, a number, a title and text.](../images/sections/features-cards.webp)

**`list`**: the heading on the left, the items as a numbered list on the right.

![Features, list layout: heading on the left, a numbered list of benefits on the right.](../images/sections/features-list.webp)

**`bento`**: one large card beside smaller ones. Four or six items fill the grid best.

![Features, bento layout: one large card with a picture and smaller cards beside it.](../images/sections/features-bento.webp)

**`screens`**: a picture on top of every card at the same 16:10, made for screenshots. Six items fill two rows of three.

![Features, screens layout: heading on the left and intro on the right, over cards with a wide picture each.](../images/sections/features-screens.webp)

Content: 3 to 6 `items`, each with a `title`, an optional `description` and an optional `image`. Optional: `eyebrow`, `heading`, `intro` and `link`.

## Add it to your site

A new site has it. A site made before this section existed, or before the `screens` layout, gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add features
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
