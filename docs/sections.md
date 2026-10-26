---
title: Sections
description: "Every section the starter template ships, with each layout, its options, what it holds and a screenshot of it."
---

The default template ships 14 section types and 41 layouts. This page lists each one: what it is for, the layouts you can switch between, and the options and content it takes. Every screenshot is the layout with its default content, on the `base` tone.

Every section shares four controls, in the editor's **Section** tab and in the page JSON:

- **Layout** (`variant`): one of the layouts listed under the section.
- **Tone** (`tone`): `base`, `subtle`, `inverse` or `brand`. Every layout works in all four.
- **Motion** (`motion`): whether the section animates in. The site-wide default applies until you set it.
- **Anchor** (`anchor`): an optional lowercase slug that becomes the section's `id`, so a link can jump to it.

Optional text, links and images can be left out. The editor shows an empty field or an **Add** slot, and a built page leaves out whatever is empty. A section with a list shows its recommended length next to the list, and refuses to go outside the minimum and maximum. Sections are defined in `templates/default/src/components/sections/<name>/`. See [Building a theme](themes.md#section-registry) to change one or add your own, and [Content files](content.md) for the JSON.

| Section | Use it for | Layouts |
| --- | --- | --- |
| [Hero](#hero) | The opening of a page | `split`, `centered`, `editorial` |
| [Logo strip](#logo-strip) | Customer or partner logos | `row`, `grid`, `marquee` |
| [Steps](#steps) | A few short points with an icon each | `columns`, `rail`, `list` |
| [Gallery](#gallery) | Many pictures, with a lightbox | `grid`, `masonry`, `featured` |
| [Features](#features) | Cards of benefits | `cards`, `list`, `bento` |
| [Text](#text) | Plain long-form text | `left`, `center` |
| [Text + Image](#text--image) | Text beside a picture | `right`, `left`, `wide` |
| [Stats](#stats) | Big numbers with short labels | `row`, `cards`, `split` |
| [Testimonials](#testimonials) | Quotes with a name | `grid`, `featured`, `carousel` |
| [Pricing](#pricing) | Plans side by side | `tiers`, `table`, `single` |
| [Media](#media) | One video or image | `centered`, `wide`, `split` |
| [FAQ](#faq) | Questions that open to show answers | `accordion`, `split`, `grid` |
| [Call to action](#call-to-action) | A closing heading and button | `band`, `centered`, `terminal` |
| [Contact](#contact) | Contact details beside a form | `split`, `card`, `minimal` |

## Hero

The opening heading, a short intro, up to two buttons and a picture. Put it first on a page.

**`split`** (default): text on the left, the picture on the right.

![Hero, split layout: heading, intro and buttons on the left, a picture on the right.](images/sections/hero-split.webp)

**`centered`**: everything centered, with a wide picture under the buttons.

![Hero, centered layout: centered heading, intro and buttons with a wide picture below.](images/sections/hero-centered.webp)

**`editorial`**: an oversized heading, then the intro and the buttons side by side under a rule, with the picture below.

![Hero, editorial layout: a very large heading, then intro and buttons side by side, then a wide picture.](images/sections/hero-editorial.webp)

Options:

- **Primary button** (`button`, on by default): turn it off to hide the primary button.
- **Install command** (`code`): `off`, `action` (a copy button in the button row, in place of the secondary button), `chip` or `terminal`. It shows the `command` text.
- **Background glow** (`glow`, off by default).

Content, all optional: `eyebrow`, `heading`, `sub`, `badge` (`tag`, `text`, `href`; it takes the eyebrow's place in `split` and `centered`), `primary`, `secondary`, `command` and `image`.

## Logo strip

A row of customer or partner logos under a small label. Each logo needs alt text.

**`row`** (default): the logos in one row beside the label, wrapping on narrow screens.

![Logo strip, row layout: a label and a row of logos.](images/sections/logo-strip-row.webp)

**`grid`**: the logos in a ruled grid.

![Logo strip, grid layout: logos separated by thin rules.](images/sections/logo-strip-grid.webp)

**`marquee`**: the logos scroll sideways in a loop, and pause while the pointer is over them or focus is inside.

![Logo strip, marquee layout: a scrolling strip of logos fading out at both edges.](images/sections/logo-strip-marquee.webp)

Content: `label` (optional) and `logos`, six recommended.

## Steps

A few short points, each with an icon, a title and a description. Use it for steps or for reasons.

**`columns`** (default): the steps as cards side by side.

![Steps, columns layout: heading and intro on top, three cards below.](images/sections/steps-columns.webp)

**`rail`**: a centered heading, with the steps along a thin line.

![Steps, rail layout: centered heading and three steps along a line.](images/sections/steps-rail.webp)

**`list`**: the heading on the left, the steps as a numbered list on the right.

![Steps, list layout: heading on the left, a vertical list of steps on the right.](images/sections/steps-list.webp)

Options: **Show numbers** (`numbered`, on by default).

Content: 2 to 6 `steps`, 3 or 4 recommended, each with an `icon` (`terminal`, `edit`, `upload`, `moon`, `git`, `check`, `bolt`, `cursor`, `sliders` or `database`), a `title` and an optional `description`. Optional: `eyebrow`, `heading`, `body` and `link`.

## Gallery

A set of pictures. Clicking one opens it large in a lightbox, with its caption, previous and next buttons, arrow keys and swipe. With JavaScript off, each picture links to its large file. While the editor is on the page, a click edits the picture instead.

**`grid`** (default): uniform crops in rows.

![Gallery, grid layout: pictures of the same shape in rows.](images/sections/gallery-grid.webp)

**`masonry`**: columns that keep each picture's own proportions.

![Gallery, masonry layout: pictures of different heights in columns.](images/sections/gallery-masonry.webp)

**`featured`**: the first picture large, the rest beside and below it.

![Gallery, featured layout: one large picture and a grid of smaller ones.](images/sections/gallery-featured.webp)

Options:

- **Pictures per row** (`columns`): `2`, `3` (default) or `4`. Fewer on narrow screens.
- **Open pictures large on click** (`lightbox`, on by default).
- **Draw a box around each picture** (`frame`, off by default): a bordered box, so a picture that does not fill its frame still shows where the frame ends.

Content: 1 to 24 `images`, 6 to 12 recommended. Each needs alt text. An optional `caption` shows under the picture in the lightbox; a picture without one shows its alt text there. Optional: `eyebrow`, `heading` and `body`.

## Features

Cards with a title, a description and an optional picture.

**`cards`** (default): the items as cards in a row.

![Features, cards layout: four cards, each with a picture, a number, a title and text.](images/sections/features-cards.webp)

**`list`**: the heading on the left, the items as a numbered list on the right.

![Features, list layout: heading on the left, a numbered list of benefits on the right.](images/sections/features-list.webp)

**`bento`**: one large card beside smaller ones. Four or six items fill the grid best.

![Features, bento layout: one large card with a picture and smaller cards beside it.](images/sections/features-bento.webp)

Content: 3 to 6 `items`, each with a `title`, an optional `description` and an optional `image`. Optional: `eyebrow`, `heading`, `intro` and `link`.

## Text

Plain long-form text for an About, a policy or any simple page. The body is rich text and may also use `##` and `###` headings, which other sections' bodies do not.

**`left`** (default): the heading and body aligned left.

![Text, left layout: a left-aligned heading, paragraphs, a subheading and a list.](images/sections/text-left.webp)

**`center`**: the heading centered over the body.

![Text, center layout: a centered heading over a left-aligned body.](images/sections/text-center.webp)

Options: **Narrow column** (`narrow`, on by default) keeps lines about 65 characters wide. Turn it off for a full-width body.

Content: `body`, with optional `eyebrow` and `heading`.

## Text + Image

Text beside a picture, with a short list of points and a link.

**`right`** (default): text on the left, the picture on the right.

![Text and image, right layout: text on the left, a picture on the right.](images/sections/text-image-right.webp)

**`left`**: the picture on the left.

![Text and image, left layout: a picture on the left, text on the right.](images/sections/text-image-left.webp)

**`wide`**: the text above, with a full-width picture below.

![Text and image, wide layout: heading and text across the top, a wide picture below.](images/sections/text-image-wide.webp)

Content: `points` (three recommended), an `image`, optional `eyebrow`, `heading`, `body` and `link`.

## Stats

Big numbers with a short label under each.

**`row`** (default): the numbers in a ruled row.

![Stats, row layout: four large numbers with labels in a row.](images/sections/stats-row.webp)

**`cards`**: each number in its own card.

![Stats, cards layout: four cards, each with a number and a label.](images/sections/stats-cards.webp)

**`split`**: the heading on the left, the numbers in a grid on the right.

![Stats, split layout: heading on the left, four numbers in a two by two grid on the right.](images/sections/stats-split.webp)

Content: `items` of `{ value, label? }`, four recommended. Optional: `eyebrow`, `heading` and `body`.

## Testimonials

Quotes with a name, a role and an optional avatar.

**`grid`** (default): the quotes as cards in columns.

![Testimonials, grid layout: three quote cards side by side.](images/sections/testimonials-grid.webp)

**`featured`**: one large quote, with the others in a row below.

![Testimonials, featured layout: one large quote on top and two smaller quotes below.](images/sections/testimonials-featured.webp)

**`carousel`**: one quote at a time, with a portrait, a counter and previous and next buttons.

![Testimonials, carousel layout: one quote beside a portrait, with a counter and arrows.](images/sections/testimonials-carousel.webp)

Content: `items` of `{ quote, name, role?, image? }`, three recommended. Optional: `eyebrow` and `heading`.

## Pricing

Plans side by side, with one highlighted and a monthly and yearly switch.

**`tiers`** (default): each plan as a card, the featured one in dark.

![Pricing, tiers layout: three plan cards, the middle one highlighted, with a monthly and yearly switch.](images/sections/pricing-tiers.webp)

**`table`**: a comparison table. It reads the section's `rows`: a label, then one value per plan, where a value is text or a tick.

![Pricing, table layout: a comparison table with the featured plan's column highlighted.](images/sections/pricing-table.webp)

**`single`**: the featured plan large, with its features beside it.

![Pricing, single layout: one highlighted plan beside a card listing its features.](images/sections/pricing-single.webp)

Options: **Yearly discount** (`yearlyDiscount`): a number from 0 to 1, `0.2` by default.

Content: `plans` of `{ name, blurb?, monthly, featured?, cta?, features }`, three recommended. A plan's `cta` is a link `{ label, href }`. Optional: `rows`, `eyebrow`, `heading`, `intro` and `singleHeading`.

## Media

One video or one image under a heading. A video can be a YouTube or Vimeo link or a link to a video file. YouTube and Vimeo load nothing until the visitor presses play, and go through `youtube-nocookie.com` and Vimeo with Do Not Track. A YouTube video without a poster shows its own thumbnail. An empty media frame is a hint in the editor: a built site leaves it out.

**`centered`** (default): heading and text centered above the frame.

![Media, centered layout: centered heading and text above a video with a play button.](images/sections/media-centered.webp)

**`wide`**: the heading and text side by side above a wide frame.

![Media, wide layout: heading on the left, text on the right, a wide video below.](images/sections/media-wide.webp)

**`split`**: the text on the left, the frame on the right.

![Media, split layout: text on the left, a video on the right.](images/sections/media-split.webp)

Options:

- **Type** (`kind`): `video` (default) or `image`.
- **Shape** (`aspect`): `16:9` (default), `4:3`, `21:9` or `1:1`.
- **Video playback** (`playback`): `controls` (default), or `loop` for a video file. A looping video is muted, plays while it is on screen, and stays paused with reduced motion.
- **Show heading** (`intro`, on by default).

Content, all optional: `eyebrow`, `heading`, `body`, `video`, `poster`, `image`, `label` and `caption`. The editor's **Video** field takes a link or a path, and can upload a video file to `public/videos`. See [The editor](editor.md#videos).

Older sites had a separate Video section. Content version 2 turns it into Media when the file is next saved.

## FAQ

Questions that open to show their answers.

**`accordion`** (default): a centered stack of questions, one open at a time.

![FAQ, accordion layout: a centered heading and a stack of questions, the first one open.](images/sections/faq-accordion.webp)

**`split`**: the heading and a link on the left, the questions on the right.

![FAQ, split layout: heading on the left, questions on the right.](images/sections/faq-split.webp)

**`grid`**: every question with its answer showing, in columns.

![FAQ, grid layout: numbered questions with their answers in three columns.](images/sections/faq-grid.webp)

Content: 4 to 8 `items` of `{ question, answer }`. Optional: `eyebrow`, `heading`, `more` and `link`.

## Call to action

A closing heading, a short text and one or two buttons.

**`band`** (default): a rounded accent-colored band, with the install command beside the text.

![Call to action, band layout: a green band with a heading, text, buttons and a command box.](images/sections/cta-band.webp)

**`centered`**: centered text and buttons, with the command underneath.

![Call to action, centered layout: a centered heading, text, two buttons and a command line.](images/sections/cta-centered.webp)

**`terminal`**: the text on the left, a terminal window on the right.

![Call to action, terminal layout: text and buttons on the left, a dark terminal window on the right.](images/sections/cta-terminal.webp)

Content, all optional: `heading`, `body`, `command`, `output`, `primary` and `secondary`. In the `terminal` layout, `output` holds up to 8 lines of `{ prompt?, text }` printed under the command.

## Contact

Contact details beside a form.

The form posts to the section's `action` address when it has one: a form service such as Formspree or Web3Forms, or your own endpoint. Without an `action`, the form only shows "Message sent." on the page and sends nothing, so set one before you publish.

**`split`** (default): the heading and details on the left, the form on the right.

![Contact, split layout: heading and an email address on the left, a form on the right.](images/sections/contact-split.webp)

**`card`**: a centered heading over a form in a card.

![Contact, card layout: a centered heading above a card holding the form.](images/sections/contact-card.webp)

**`minimal`**: a large heading and a form with underlined fields.

![Contact, minimal layout: a large heading above a form with underlined fields and a send button.](images/sections/contact-minimal.webp)

Content: `details` (a `label` and a `value` each, such as an email address) and `topics` (the choices in the topic menu), three of each recommended. Optional: `action`, `eyebrow`, `heading`, `body`, `note` and `thanks`.
