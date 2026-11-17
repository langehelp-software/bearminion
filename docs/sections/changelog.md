---
title: Changelog
description: "The latest releases, newest first: a version, a title and a few lines on what changed, with a link to the full notes. The first release is shown as the latest."
sidebar:
  order: 14
  label: Changelog
---

The latest releases, newest first: a version, a title and a few lines on what changed, with a link to the full notes. The first release in the list is the latest, and its version chip takes the accent color. It is content like any other section, so you write the releases yourself: the page says what a release means for a reader, the full notes say the rest.

**`cards`** (default): one card per release, side by side.

![Changelog, cards layout: three release cards, each with a version chip, a title, three changes and a Read more link.](../images/sections/changelog-cards.webp)

**`timeline`**: one release per row, the version and date on the left.

![Changelog, timeline layout: three releases in rows, the version and date on the left, the title and changes on the right.](../images/sections/changelog-timeline.webp)

Content: 1 to 6 `releases` of `{ version, date?, ref?, title, items, link? }`, each with 1 to 6 `items`. Optional: `eyebrow`, `heading`, `body` and `link`, the link beside the heading to every release.

- `ref` is a short commit hash or tag, shown beside the version.
- `items` are one line each. Text in backticks shows as code.

## Add it to your site

A new site does not have it. One command adds it: it copies the section and the files it needs, and never overwrites a file you changed.

```sh
npx bearminion add changelog
```

Back to [all sections](README.md). See [The command line](../cli.md) for what `add` does.
