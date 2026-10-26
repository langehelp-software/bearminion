---
title: Hero
description: "The opening heading, a short intro, up to two buttons and a picture. Put it first on a page."
sidebar:
  order: 1
  label: Hero
---

The opening heading, a short intro, up to two buttons and a picture. Put it first on a page.

**`split`** (default): text on the left, the picture on the right.

![Hero, split layout: heading, intro and buttons on the left, a picture on the right.](../images/sections/hero-split.webp)

**`centered`**: everything centered, with a wide picture under the buttons.

![Hero, centered layout: centered heading, intro and buttons with a wide picture below.](../images/sections/hero-centered.webp)

**`editorial`**: an oversized heading, then the intro and the buttons side by side under a rule, with the picture below.

![Hero, editorial layout: a very large heading, then intro and buttons side by side, then a wide picture.](../images/sections/hero-editorial.webp)

Options:

- **Primary button** (`button`, on by default): turn it off to hide the primary button.
- **Install command** (`code`): `off`, `action` (a copy button in the button row, in place of the secondary button), `chip` or `terminal`. It shows the `command` text.
- **Background glow** (`glow`, off by default).

Content, all optional: `eyebrow`, `heading`, `sub`, `badge` (`tag`, `text`, `href`; it takes the eyebrow's place in `split` and `centered`), `primary`, `secondary`, `command` and `image`.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add hero
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
