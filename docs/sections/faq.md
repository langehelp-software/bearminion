---
title: FAQ
description: "Questions that open to show their answers."
sidebar:
  order: 12
  label: FAQ
---

Questions that open to show their answers.

**`accordion`** (default): a centered stack of questions, one open at a time.

![FAQ, accordion layout: a centered heading and a stack of questions, the first one open.](../images/sections/faq-accordion.webp)

**`split`**: the heading and a link on the left, the questions on the right.

![FAQ, split layout: heading on the left, questions on the right.](../images/sections/faq-split.webp)

**`grid`**: every question with its answer showing, in columns.

![FAQ, grid layout: numbered questions with their answers in three columns.](../images/sections/faq-grid.webp)

Content: 4 to 8 `items` of `{ question, answer }`. Optional: `eyebrow`, `heading`, `more` and `link`.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add faq
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
