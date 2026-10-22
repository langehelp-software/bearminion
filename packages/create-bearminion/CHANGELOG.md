# create-bearminion

## 1.3.0

### Minor Changes

- 4de8434: Custom JSON-LD and analytics snippets. A page's `seo.jsonLd` holds parsed JSON-LD blocks that replace the generated `WebPage` markup, and `site.analytics` (`head`, `bodyEnd`) holds raw snippets the template emits on the live site only: not in `astro dev`, and not in Vercel or Netlify preview deployments. Nothing needs configuring; `BEARMINION_ANALYTICS=on|off` overrides the choice for hosts that cannot be told apart. The Pages tab shows an SEO card (search result preview and badges) with an Edit SEO button that opens a dialog for every SEO field, including JSON-LD with validation and script-tag unwrapping. The Site tab has an Analytics & scripts group. `parseJsonLdInput`, `formatJsonLd`, `jsonLdWarnings`, `jsonLdSchema` and `siteAnalyticsSchema` are exported. Themes need to render the two new fields (see the theme docs).

### Patch Changes

- 826b0ac: `create-bearminion` speaks in the BearMinion voice: the prompts, progress lines, errors, next steps and `--help` text. The messages say the same things, with fewer words and a grumpier bear.
- 2032a4a: Template: footer columns stay left-aligned on small screens instead of piling up on the right. They stack in one column on phones, two columns on larger phones, three columns on tablets, and sit beside the brand block from wide layouts up.

## 1.2.1

### Patch Changes

- 755bad0: The Media section's video cover is a responsive image (a WebP `srcset` from 480 to 1920 pixels wide), so a phone no longer downloads the full-size poster, and it loads at once instead of lazily when the section is one of the first two on the page, where it is often the largest thing on screen.
- 0a2301e: The package pages link to the new website and documentation: the npm homepage is https://bearminion.com, and the READMEs (including the template's) point to https://docs.bearminion.com instead of Markdown files on GitHub.

## 1.2.0

### Minor Changes

- 4c3f823: New sections and section options in the default template, from the bearminion.com design:
  
  - **Media**: one video or image under a heading, in centered, wide and split layouts, with a shape (16:9, 4:3, 21:9, 1:1) and a switch for the heading. A YouTube or Vimeo link plays through youtube-nocookie.com or Vimeo with Do Not Track, and nothing loads until the visitor presses play.
  - **Steps**: two to six short points with an icon each, as cards, a rail or a list, numbered or not. The grid never leaves one card alone on a row.
  - **Hero**: an install command with a Copy button in three styles (in the button row, a chip, or a terminal), a switch that hides the primary button, and a linked badge in place of the eyebrow, and an optional soft background glow in the accent color.
  - **Features**: the bento layout takes three to six cards instead of exactly four.
  - **Text + Image**: points are rich text, so they can hold bold, links and `code`.
  - **Call to action**: the terminal layout is a dark terminal in every tone, and each printed line can start with a prompt such as → or ✓.
  
  Fixes: headings render semibold and eyebrows in the mono font, as the type scale defines (a default weight and font were overriding them); a section with motion switched off is no longer hidden on a long page; an empty Video or Media frame shows only in the editor and is left out of the built site.
- 9261888: The default template has a new **Video** section (framed, wide and split layouts) for an `.mp4` or `.webm` file, with a poster image, a caption, and a `loop` playback option that plays muted while the video is on screen and stays paused with reduced motion. YouTube and other page links are refused with a message saying why. The hero gains an optional `command`, shown with a copy button, and the terminal call to action's printed lines are now editable (`output`) instead of fixed text.

### Patch Changes

- d584e76: The FAQ's split layout had a fixed "Contact us" link to `#contact` that could not be edited or removed, and pointed nowhere on a page without a contact section. It is now an optional `link`, editable in the editor like any other button.
- 19c1e5a: The default template uses the new field rules: Steps icons are picked from an icon grid, Media shows the Video, Poster and Label fields only for a video, the Image field only for an image, and the heading fields only while Show heading is on, and Hero hides the command while Install command is off, the primary button while it is switched off, the secondary button while the command takes its place, and the badge in the editorial layout.

## 1.1.0

### Minor Changes

- 8a97a6c: New: `npm create bearminion@latest my-site` creates a BearMinion site. It asks for the folder, the site name and its web address, copies the default template, installs and makes the first git commit. `--storybook` adds Storybook, `--yes` asks nothing, and `--no-install`, `--no-git`, `--pm`, `--name` and `--url` cover the rest.
