---
title: Sections
description: "Every section BearMinion has, which ones a new site starts with, the controls they share and a page for each one: layouts, options, content and screenshots."
sidebar:
  order: 0
  label: Overview
---

There are 17 section types and 50 layouts. A new site starts with nine of them, marked **starter** below; the rest are one command away (`npx bearminion add pricing`), and the Contact section comes with its form handler from `npx bearminion add form`. Each one has its own page: what it is for, the layouts you can switch between, and the options and content it takes. On docs.bearminion.com every layout is shown live, with its default content: switch its tone and the screen width, and open the **Content** tab for the section as it sits in a page file. On GitHub the pages show a screenshot of each layout instead.

Every section shares four controls, in the editor's **Section** tab and in the page JSON:

- **Layout** (`variant`): one of the layouts listed under the section.
- **Tone** (`tone`): `base`, `subtle`, `inverse` or `brand`. Every layout works in all four.
- **Motion** (`motion`): whether the section animates in. The site-wide default applies until you set it.
- **Anchor** (`anchor`): an optional lowercase slug that becomes the section's `id`, so a link can jump to it.

Optional text, links and images can be left out. The editor shows an empty field or an **Add** slot, and a built page leaves out whatever is empty. A section with a list shows its recommended length next to the list, and refuses to go outside the minimum and maximum. Sections are defined in `templates/default/src/components/sections/<name>/`. See [Building a theme](../themes.md#section-registry) to change one or add your own, and [Content files](../content.md) for the JSON.

| Section | Use it for | Layouts | In a new site |
| --- | --- | --- | --- |
| [Hero](hero.md) | The opening of a page | `split`, `centered`, `editorial` | starter |
| [Logo strip](logo-strip.md) | Customer or partner logos | `row`, `grid`, `marquee` | `add logo-strip` |
| [Steps](steps.md) | A few short points with an icon each | `columns`, `rail`, `list`, `keys`, `panel` | starter |
| [Gallery](gallery.md) | Many pictures, with a lightbox | `grid`, `masonry`, `featured` | starter |
| [Features](features.md) | Cards of benefits | `cards`, `list`, `bento`, `screens` | starter |
| [Text](text.md) | Plain long-form text | `left`, `center` | starter |
| [Text + Image](text-image.md) | Text beside a picture | `right`, `left`, `wide` | starter |
| [Stats](stats.md) | Big numbers with short labels | `row`, `cards`, `split` | `add stats` |
| [Testimonials](testimonials.md) | Quotes with a name | `grid`, `featured`, `carousel` | `add testimonials` |
| [Pricing](pricing.md) | Plans side by side | `tiers`, `table`, `single` | `add pricing` |
| [Media](media.md) | One video or image | `centered`, `wide`, `split` | starter |
| [Code tabs](code-tabs.md) | Code samples in tabs, with numbered points | `side`, `top` | `add code-tabs` |
| [Compare](compare.md) | Options side by side, yours highlighted | `centered`, `left` | `add compare` |
| [Changelog](changelog.md) | The latest releases and what changed | `cards`, `timeline` | `add changelog` |
| [FAQ](faq.md) | Questions that open to show answers | `accordion`, `split`, `grid` | starter |
| [Call to action](cta.md) | A closing heading and button | `band`, `centered`, `terminal` | starter |
| [Contact](contact.md) | Contact details beside a form | `split`, `card`, `minimal` | `add form` |

Any section a site does not have yet, it gets with `npx bearminion add <name>`; see [The command line](../cli.md).
