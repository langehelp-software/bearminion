# create-bearminion

## 1.10.0

### Minor Changes

- a10e4a7: New command `npx bearminion check form`. It reads the site's files and environment and names what keeps the Contact form from working: a missing handler or glue file, an import without `.js`, a Netlify function in the wrong folder or without a path, a Wrangler config without `main`, with the placeholder name or without `CONTACT_FROM` and `CONTACT_TO` under `vars`. Each problem comes with its fix. It writes nothing and cannot see the host's own settings. `--host` and `--json` work as for `add form`.

## 1.9.3

### Patch Changes

- e94dcc1: Fix the release of `create-bearminion`, which was never published after 1.8.0: publishing both packages rebuilt them at the same time, and bearminion's build emptied the files create-bearminion's build was reading. The release now builds each package once, in order.

## 1.9.2

### Patch Changes

- 9c0466c: `npx bearminion add form resend --host netlify` and `--host cloudflare` write the Netlify Function (`netlify/functions/contact.mts`) and a Cloudflare Worker (`worker.ts`, plus a `wrangler.jsonc` when the site has no Wrangler config) next to the handler. A real message has gone through Resend on Vercel, Netlify and Cloudflare. A failed handler now logs its message as text, which Cloudflare's logs had dropped. `.env.example` no longer spells out Cloudflare's test keys, which made Netlify's secrets scan fail a build that used them, and the Forms guide says how to keep the public site key out of that scan.
- 6fb095f: The Contact form's Turnstile check turns on by itself when `TURNSTILE_SECRET_KEY` is in the environment, so the widget on the page can no longer sit in front of a server that checks nothing. `turnstile: true` still requires it and `turnstile: false` turns it off. A genuine token is also refused when Cloudflare says the widget was served on a host other than the one the function runs on; `turnstile: { hostnames }` lists others. The visitor address sent to Turnstile now comes from the host's own header, or the last `x-forwarded-for` entry, not the first, which the visitor can set. A site that had the secret key set and no option now checks tokens: if its page has no site key, the form refuses every message until the site key is set.

## 1.9.1

### Patch Changes

- dd5c397: The Vercel function that `npx bearminion add form resend --host vercel` writes now imports the handler as `../src/forms/contact.js`. Vercel runs the function as an ES module, which does not guess file extensions, so the extensionless import failed with `ERR_MODULE_NOT_FOUND`. A site that already has the old `api/contact.ts` needs the same one-word change, or `npx bearminion add form resend --host vercel --overwrite`.

## 1.9.0

### Minor Changes

- d1c211b: `npx bearminion add <section...>` copies a section into an existing site, with the atoms, molecules and helpers it imports, and lists it in the generated section files. It writes a file only when the site has none, or has an earlier release's copy that nobody changed; a file you changed stops it, and nothing is written unless you pass `--overwrite`. `--list`, `--dry-run`, `--yes`, `--diff`, `--install` and `--json` are there for people and for scripts. New sites start with a `bearminion.lock.json`, and `add` keeps it up to date. The files come from a registry that ships inside the package, so nothing is downloaded. See [The command line](https://github.com/langehelp-software/bearminion/blob/main/docs/cli.md).
- 7819b98: `npx bearminion add form resend --host vercel` writes the Contact form's handler to `src/forms/contact.ts` and the Vercel function that runs it. It is the first form recipe sent through a real service; Formspree, Web3Forms, Postmark, Slack and the Netlify, Cloudflare and Astro glue stay in the Forms guide as files to copy until each has been tried. The handler is written with example `FROM` and `TO` addresses and refuses to send until you change them. The command never replaces a handler you wrote unless you pass `--overwrite`, and it notes the files in `bearminion.lock.json`. `BEARMINION_FORMS=required` in the host's build environment makes `astro build` fail while a Contact form has no handler. See [The command line](https://github.com/langehelp-software/bearminion/blob/main/docs/cli.md#add-a-form-handler).
- 7819b98: A detail in the Contact section has a **Hide from crawlers** switch. Switched on, the built page carries the email address or phone number scrambled and a few lines of script show it when the page loads, so crawlers that only read the HTML find nothing to collect. It is off by default and changes nothing for existing sites. The editor can now show an optional on/off switch on a list item that does not have it yet. The form recipe for Resend reads the sender and receiver from `CONTACT_FROM` and `CONTACT_TO`, so no address is written into the repository.

### Patch Changes

- 75bf724: A text field you edit in the sidebar now shows on the page before you save. It used to update only when the same text was typed on the page itself, so a change to, say, a Contact detail or an eyebrow stayed invisible until you saved and reloaded.

## 1.8.0

### Minor Changes

- 305d094: A section type is now a directory, and nothing else has to be edited. `npx bearminion sync` (new command) writes `definitions.gen.ts` and `components.gen.ts` from the directories under `sections/`; the starter's hand-written `registry.ts` and the `case` per section in `SectionList.astro` are gone. The new `sectionsDir` option makes `astro build`, `astro check` and `astro sync` stop when the generated files are stale, and `astro dev` warn. `npx bearminion sync --check` is the same test for CI.
  
  Sites created before this release keep working as they are. To move one over, copy `definitions.ts`, `SectionList.astro` and `astro.config.ts` from a new site, delete `registry.ts`, run `npx bearminion sync`, and read [Add a section type](https://github.com/langehelp-software/bearminion/blob/main/templates/default/README.md#add-a-section-type).

## 1.7.0

### Minor Changes

- 2978aaf: Run your own code behind the Contact form, with its keys on the server and in the environment. The new `bearminion/forms` entry has `defineForm(handler, options)`: put it in `src/forms/contact.ts` and add a few lines of glue for Vercel, Netlify, Cloudflare or an Astro endpoint (all in the Forms guide). The form always posts to `/api/contact`; nothing about it is stored in the content files. The handler receives the message and your environment, and returns nothing, `{ ok: true, message }`, `{ ok: false, error, fieldErrors }`, or throws a `FormError`; any other error becomes a plain "could not be delivered" for the visitor and goes to your log. It answers `POST` only, reads JSON, multipart and urlencoded posts, refuses posts over 64 KB and posts from other sites (`origins` lists the exceptions), and drops a filled trap field on the server too. It uses only `Request` and `Response`, so one file runs on every host. `astro dev` serves each file in `src/forms` at `/api/<name>`: a dry run that prints the message by default, and your handler for real with `BEARMINION_FORMS_LIVE=on` in `.env.local` (turn the route off with the `forms: false` option). Cloudflare Turnstile: set the public site key as `PUBLIC_TURNSTILE_SITE_KEY` where the site is built, and `defineForm(handler, { turnstile: true })` checks the token with `TURNSTILE_SECRET_KEY`; `verifyTurnstile` is exported too. A failed send now shows its error in a message at the bottom of the screen that stays until the visitor closes it. A handler's `{ ok: true, message }` replaces the thank-you text. The starter gets a `.env.example` listing those variables. The Forms guide is rewritten so you can set all of it up yourself.
- 2978aaf: The Contact form no longer says "Message sent." for a message that went nowhere. It posts with `fetch` to `/api/contact` and shows the states: sending, sent, an error from the handler, field errors under their fields, and no connection. A trap field and a 1.5 second minimum time drop what a script sends. While `src/forms/contact.ts` does not exist, `astro dev` and `astro build` print a warning (never an error), the section's settings in the editor show the same warning, and a visitor who sends the form gets an error. `bearminion` exports the types `FormSubmission` and `FormResult` for handlers you write yourself. `defineSection` takes a `form` option: the handler a section posts to, which the editor's sidebar reports on, and a new editor route `GET /forms` says whether its file exists. **Breaking for sites that set an endpoint:** the Contact section no longer has an `action` prop. Content version 3 drops `action` (and `format` and `turnstile`) from every Contact section, and the file is rewritten the next time it is saved. Copy a form service's address into a handler first: the Forms guide has complete files for Formspree and Web3Forms. New guide: Forms.

### Patch Changes

- 2978aaf: Fixed an error in the browser console, "Cannot read properties of undefined (reading 'toLowerCase')", when the browser autofilled a form on a page with the editor. Autofill sends key events without a `key`, and the editor's keyboard shortcuts assumed one.
- 60cfb70: The Contact form works with JavaScript off. A browser that posts the form itself is no longer left on the raw JSON answer: `defineForm` redirects it back to the page, to a "Message sent." block or a "not sent" line (only when the `Referer` is on the same site; otherwise the JSON answer stays). Pages with section motion were also invisible without JavaScript, because sections start transparent and a script reveals them; they now show.
- 2978aaf: Fix: a video uploaded in the editor now plays in the dev site straight away. Vite learns which files `public/` holds from its file watcher, and the editor keeps the videos folder out of that watcher so uploads do not reload the page, so a new video answered 404 until `astro dev` was restarted. The editor now tells Vite about the one file that was added or removed. The template's `astro.config.ts` also reads `BEARMINION_VIDEOS_DIR` (used by the tests, like the content and uploads overrides).

## 1.6.0

### Minor Changes

- eec6f3d: New starter sections and editor features.
  
  - **Gallery** section: grid, masonry and featured layouts, a keyboard-friendly lightbox, an optional box around each picture, and required alt text.
  - **Text** section: long-form rich text for an About or policy page, with a narrow, readable column on by default. Rich-text fields can opt into **H2** and **H3** (`data-rich-headings`); `renderRichText`, `sanitizeRichHtml` and `stripPlainRich` take a `{ headings }` option.
  - **Media** now covers video: the separate Video section is gone, and Media gains `playback` (`controls` or `loop`). Content `schemaVersion` 2 migrates existing Video sections to Media automatically.
  - **Video uploads**: upload an mp4, webm, mov or ogv to `public/videos` from the editor (`videosDir`, `maxVideoBytes`, default 50 MB), pick an uploaded one, and see what a pasted link is or why it will not play. New API routes `GET`/`POST /videos` and `DELETE /videos/:filename`.
  - `parseMediaSource` and `VIDEO_FILE` are exported from `bearminion`.

### Patch Changes

- eec6f3d: Clearer package descriptions and READMEs: what BearMinion is, who it is for, and what `create-bearminion` refuses (a folder that is not new or empty).

## 1.5.0

### Patch Changes

- 8a428e7: Sitewide JSON-LD. `site.seo.jsonLd` is optional (up to 10 blocks, 50 KB, so no migration) and the default template emits its blocks on every page. A page's own `seo.jsonLd` still replaces only the generated `WebPage` block, and a block with the same `@id` is emitted once, the page's first. With the conventional ids `<url>/#organization` and `<url>/#website` in the site's blocks, the generated `WebPage` gets `isPartOf` and `publisher` as `@id` references. The Site tab has a Structured data group with an Edit JSON-LD dialog and a Generate button that fills an `Organization` and a `WebSite` from the site name, address and language, replacing blocks with the same `@id`. The logo is added only for a full https address. A warning shows while the site address is still `example.com`. `siteJsonLdIds`, `mergeJsonLd`, `hasJsonLdId`, `generateSiteJsonLd`, `upsertJsonLd` and `isPlaceholderSiteUrl` are exported; themes that emit JSON-LD should use `mergeJsonLd` (see the theme docs).

## 1.4.0

### Minor Changes

- 5d333af: Cookie banner for analytics. `site.consent` (`enabled`, `title`, `body`, `accept`, `reject`, `settings`, `policyLabel`, `policyHref`) is optional, and the banner is on by default: a site that has analytics snippets now asks visitors first, so one that did not want a banner needs `consent.enabled: false` (Site tab, Cookie banner switch). The template sets Google Consent Mode v2 to denied before any tag, keeps the snippets in `<template>` until the visitor accepts, then sends the update and runs them. A footer link, or a corner cookie icon (`reopen: "icon"`), reopens the banner, and withdrawing clears Google Analytics cookies and reloads. The Site tab has a Cookie banner group with the switch and an Edit banner dialog for the text and a privacy policy link. `siteConsentSchema`, `CONSENT_REOPEN`, `consentCopy`, `CONSENT_COPY`, `CONSENT_LIMITS`, `CONSENT_HREF` and `consentTextIssues` are exported. Themes that emit the snippets should hold them back the same way (see the theme docs).

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
