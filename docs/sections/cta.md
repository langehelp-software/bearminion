---
title: Call to action
description: "A closing heading, a short text and one or two buttons."
sidebar:
  order: 13
  label: Call to action
---

A closing heading, a short text and one or two buttons.

**`band`** (default): a rounded accent-colored band, with the install command beside the text.

![Call to action, band layout: a green band with a heading, text, buttons and a command box.](../images/sections/cta-band.webp)

**`centered`**: centered text and buttons, with the command underneath.

![Call to action, centered layout: a centered heading, text, two buttons and a command line.](../images/sections/cta-centered.webp)

**`terminal`**: the text on the left, a terminal window on the right.

![Call to action, terminal layout: text and buttons on the left, a dark terminal window on the right.](../images/sections/cta-terminal.webp)

Content, all optional: `heading`, `body`, `command`, `output`, `primary` and `secondary`. In the `terminal` layout, `output` holds up to 8 lines of `{ prompt?, text }` printed under the command.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add cta
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
