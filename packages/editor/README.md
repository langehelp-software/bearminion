<p align="center">
  <img src="https://raw.githubusercontent.com/langehelp-software/bearminion/main/.github/assets/banner.png" alt="BearMinion: a git-based CMS for Astro. Click to edit. Commit to publish." width="100%" />
</p>

<p align="center">
  A website you edit by clicking on it. No database, no admin panel, no server.<br />
  Built on <a href="https://astro.build">Astro</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/bearminion"><img src="https://img.shields.io/npm/v/bearminion?color=169717" alt="npm version" /></a>
  <a href="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml"><img src="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/langehelp-software/bearminion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-169717" alt="MIT license" /></a>
</p>

This package is the engine behind BearMinion. You don't install it on its own: [`npm create bearminion`](https://www.npmjs.com/package/create-bearminion) makes a site with it included.

## Quick start

You need [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm create bearminion@latest my-site
cd my-site
npm run dev
```

It asks for the site's name and web address. Open the address `npm run dev` prints, press **Ctrl+E** (**Cmd+E** on a Mac), click any text to change it, and press **Ctrl/Cmd+S** to save. Push the folder to GitHub and import it in Vercel, Netlify or Cloudflare Pages to put it online.

<p align="center">
  <img src="https://raw.githubusercontent.com/langehelp-software/bearminion/main/.github/assets/editor.png" alt="The BearMinion editor: a section toolbar on the hero, a heading being edited, and the Pages tab in the sidebar" width="100%" />
</p>

## What you can change

- **Text** right on the page, with bold, italic, links and lists
- **Sections**: ten ready-made types, each with three layouts, added from a visual picker
- **Pages, menus and footer**, with titles and descriptions for search and sharing
- **Images**: upload, choose how they fill their frame and which part stays in view
- **Colors**: pick three, and the editor builds a full light and dark palette that stays readable

Content is plain JSON in your project, validated on every save and kept in your git history. The editor only runs during `astro dev`; the published site is static HTML with nothing from the editor in it.

<p align="center">
  <img src="https://raw.githubusercontent.com/langehelp-software/bearminion/main/.github/assets/design.png" alt="The Design tab: color mode, brand, neutral and link colors, and a preview of every section tone in light and dark mode" width="100%" />
</p>

## Learn more

- [Documentation](https://github.com/langehelp-software/bearminion/blob/main/docs/README.md), including [building your own theme](https://github.com/langehelp-software/bearminion/blob/main/docs/themes.md) on this package
- [Source and issues](https://github.com/langehelp-software/bearminion)

Requires Astro 7 and Zod 4 (peer dependencies, already in the template).

## License

[MIT](https://github.com/langehelp-software/bearminion/blob/main/LICENSE) © Jakub Lange
