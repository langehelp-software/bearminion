---
title: Getting started
description: "Create a BearMinion site, edit it by clicking on the page, and put it online on Vercel, Netlify or Cloudflare."
---

BearMinion gives you an Astro website you edit by clicking on it. Your content is plain files in your project, the editor only runs on your computer, and what you publish is a static site with no database and no server.

You need [Node.js](https://nodejs.org) 22.12 or newer.

## 1. Create your site

```bash
npm create bearminion@latest my-site
```

It asks three things: the folder, the site's name and its web address. Press Enter to skip the address and set it later in the editor. Then it copies the default template, installs it and makes the first git commit.

`pnpm create bearminion`, `yarn create bearminion` and `bun create bearminion` work the same way and install with that package manager.

### Options

Pass options after `--` with npm (`npm create bearminion@latest my-site -- --yes`); pnpm, yarn and bun take them directly.

| Option | What it does |
| --- | --- |
| `--name <name>` | The site's name. Default: from the folder, so `my-coffee-shop` becomes "My Coffee Shop" |
| `--url <address>` | Its public address, such as `https://example.com`. Used for search engines, the sitemap and link previews |
| `--storybook` | Also add [Storybook](https://storybook.js.org), a workshop for the theme's components |
| `--pm <manager>` | Install with `npm`, `pnpm`, `yarn` or `bun`. Default: the one you ran |
| `--no-install` | Skip installing |
| `--no-git` | Skip creating a git repository |
| `-y`, `--yes` | Ask nothing and use the defaults, for scripts and AI agents |

The folder must be new or empty. Inside an existing git repository, the site is added as a folder and no new repository is made.

## 2. Edit it

```bash
cd my-site
npm run dev
```

Open the address it prints (usually `http://localhost:4321`) and press **Ctrl+E** (**Cmd+E** on a Mac) to open the editor.

- **Click any text** to change it. Select words in a heading to make them bold, italic or a different font.
- **Hover a section** for its toolbar: move it, add one above or below, duplicate it, open its settings or delete it.
- **Use the sidebar** for pages, navigation, the footer, colors and site settings.
- **Click an image** to upload a new one or pick one from the library.

Press **Ctrl/Cmd+S** to save. The editor writes your changes to `content/` and new images to `src/assets/uploads/`. Until you save, your edits stay in the browser, and they survive a reload.

[The editor](editor.md) describes every feature.

## 3. Put it online

1. Push the folder to a new GitHub, GitLab or Bitbucket repository.
2. Import that repository in your host. Every host below detects Astro; if one asks, the build command is `npm run build` and the output folder is `dist`.
   - [Vercel](https://docs.astro.build/en/guides/deploy/vercel/)
   - [Netlify](https://docs.astro.build/en/guides/deploy/netlify/)
   - [Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)
   - Any other static host: run `npm run build` and upload `dist/`.
3. In the editor, set your address under **Site → URL** (if you skipped it when you created the site), save, commit and push. Canonical links, the sitemap and link previews use it.

From then on: edit, save, commit, push. Your host rebuilds the site on every push.

### Analytics

Paste the snippet your analytics tool gives you under **Site → Analytics & scripts**, save, commit and push. It runs on your live site only: not while you edit, and not on Vercel or Netlify preview deployments, so your own testing stays out of the numbers. There is nothing to configure. If your host does not mark its previews, or you want to force it either way, set the environment variable `BEARMINION_ANALYTICS` to `off` or `on` for that build (see the [template guide](../templates/default/README.md#analytics)).

### Cookie banner

With a snippet set, your live site shows a cookie banner and holds the snippet back until the visitor accepts. Rejecting loads nothing. A footer link ("Cookie settings") or, if you choose it in the dialog, a small cookie icon in the bottom-left corner lets visitors change their mind, and withdrawing clears the Google Analytics cookies and reloads the page without the snippet. Google tags get [Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent): every signal is `denied` before anything loads, and `analytics_storage` becomes `granted` on accept. The ad signals stay `denied`.

Under **Site → Cookie banner**, the switch turns the banner on and off, and **Edit banner** changes its words and adds a link to your privacy policy. Visitors are asked again after 180 days.

The banner is a tool, not legal advice. Switch it off only when your analytics sets no cookies and you know the rules that apply to you. Cookieless tools (Plausible, Umami, Fathom, Vercel Web Analytics) often need no banner, but that depends on the tool and on where your visitors are. The banner also shows while you edit and on previews, so you see what visitors get; the snippets still load on the live site only.

## What is in your site

| Path | What it is |
| --- | --- |
| `content/` | Your pages (`content/pages/*.json`) and site settings (`content/site.json`). The editor writes these; see [Content files](content.md). |
| `src/assets/uploads/` | Your images |
| `src/components/` | The theme: sections, header, footer and the building blocks they use. It is your code; change it as you like. |
| `src/lib/content-model.ts` | Tells the editor which sections, header and footer layouts and fonts your theme has |
| `astro.config.ts` | Astro's settings, including the `bearminion()` integration |

The editor and its API exist only while `npm run dev` runs. `npm run build` leaves them out entirely.

## Next

- [The editor](editor.md): everything you can do on the page and in the sidebar
- [Building a theme](themes.md): add a section type, or change the look
- [Content files](content.md): the JSON the editor writes, for editing by hand or by script
