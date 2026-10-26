---
title: Text
description: "Plain long-form text for an About, a policy or any simple page. The body is rich text and may also use `##` and `###` headings, which other sections' bodies do not."
sidebar:
  order: 6
  label: Text
---

Plain long-form text for an About, a policy or any simple page. The body is rich text and may also use `##` and `###` headings, which other sections' bodies do not.

**`left`** (default): the heading and body aligned left.

![Text, left layout: a left-aligned heading, paragraphs, a subheading and a list.](../images/sections/text-left.webp)

**`center`**: the heading centered over the body.

![Text, center layout: a centered heading over a left-aligned body.](../images/sections/text-center.webp)

Options: **Narrow column** (`narrow`, on by default) keeps lines about 65 characters wide. Turn it off for a full-width body.

Content: `body`, with optional `eyebrow` and `heading`.

## Add it to your site

A site made before this section existed gets it with one command. It copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add text
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
