---
title: Sections
description: "Every section the starter template ships, with the controls they share and a page for each one: layouts, options, content and screenshots."
sidebar:
  order: 0
  label: Overview
---

The default template ships 14 section types and 41 layouts. Each one has its own page: what it is for, the layouts you can switch between, and the options and content it takes. Every screenshot is the layout with its default content, on the `base` tone.

Every section shares four controls, in the editor's **Section** tab and in the page JSON:

- **Layout** (`variant`): one of the layouts listed under the section.
- **Tone** (`tone`): `base`, `subtle`, `inverse` or `brand`. Every layout works in all four.
- **Motion** (`motion`): whether the section animates in. The site-wide default applies until you set it.
- **Anchor** (`anchor`): an optional lowercase slug that becomes the section's `id`, so a link can jump to it.

Optional text, links and images can be left out. The editor shows an empty field or an **Add** slot, and a built page leaves out whatever is empty. A section with a list shows its recommended length next to the list, and refuses to go outside the minimum and maximum. Sections are defined in `templates/default/src/components/sections/<name>/`. See [Building a theme](../themes.md#section-registry) to change one or add your own, and [Content files](../content.md) for the JSON.

| Section | Use it for | Layouts |
| --- | --- | --- |
| [Hero](hero.md) | The opening of a page | `split`, `centered`, `editorial` |
| [Logo strip](logo-strip.md) | Customer or partner logos | `row`, `grid`, `marquee` |
| [Steps](steps.md) | A few short points with an icon each | `columns`, `rail`, `list` |
| [Gallery](gallery.md) | Many pictures, with a lightbox | `grid`, `masonry`, `featured` |
| [Features](features.md) | Cards of benefits | `cards`, `list`, `bento` |
| [Text](text.md) | Plain long-form text | `left`, `center` |
| [Text + Image](text-image.md) | Text beside a picture | `right`, `left`, `wide` |
| [Stats](stats.md) | Big numbers with short labels | `row`, `cards`, `split` |
| [Testimonials](testimonials.md) | Quotes with a name | `grid`, `featured`, `carousel` |
| [Pricing](pricing.md) | Plans side by side | `tiers`, `table`, `single` |
| [Media](media.md) | One video or image | `centered`, `wide`, `split` |
| [FAQ](faq.md) | Questions that open to show answers | `accordion`, `split`, `grid` |
| [Call to action](cta.md) | A closing heading and button | `band`, `centered`, `terminal` |
| [Contact](contact.md) | Contact details beside a form | `split`, `card`, `minimal` |

A site created before a section existed gets it with `npx bearminion add <name>`; see [The command line](../cli.md).
