<p align="center">
  <img src="https://raw.githubusercontent.com/langehelp-software/bearminion/main/.github/assets/banner.png" alt="BearMinion: a git-based CMS for Astro. Click to edit. Commit to publish." width="100%" />
</p>

<p align="center">
  Create a website you edit by clicking on it. No database, no admin panel, no server.<br />
  Built on <a href="https://astro.build">Astro</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-bearminion"><img src="https://img.shields.io/npm/v/create-bearminion?color=169717" alt="npm version" /></a>
  <a href="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml"><img src="https://github.com/langehelp-software/bearminion/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/langehelp-software/bearminion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-169717" alt="MIT license" /></a>
</p>

## Quick start

You need [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm create bearminion@latest my-site
```

It asks three things: the folder, the site's name and its web address (press Enter to skip it and set it later in the editor). Then it copies the site, installs it and makes the first git commit.

```bash
cd my-site
npm run dev
```

Open the address it prints and press **Ctrl+E** (**Cmd+E** on a Mac). Click any text to change it, and press **Ctrl/Cmd+S** to save. Push the folder to GitHub and import it in Vercel, Netlify or Cloudflare Pages to put it online.

`pnpm create bearminion`, `yarn create bearminion` and `bun create bearminion` work the same way and install with that package manager.

<p align="center">
  <img src="https://raw.githubusercontent.com/langehelp-software/bearminion/main/.github/assets/editor.png" alt="The BearMinion editor: a section toolbar on the hero, a heading being edited, and the Pages tab in the sidebar" width="100%" />
</p>

## Options

Pass options after `--` with npm (`npm create bearminion@latest my-site -- --yes`); pnpm, yarn and bun take them directly.

| Option | What it does |
| --- | --- |
| `--name <name>` | The site's name. Default: from the folder (`my-coffee-shop` becomes "My Coffee Shop") |
| `--url <address>` | Its public address, such as `https://example.com`. Used for search engines, the sitemap and link previews |
| `--storybook` | Also add [Storybook](https://storybook.js.org), a workshop for the theme's components |
| `--pm <manager>` | Install with `npm`, `pnpm`, `yarn` or `bun`. Default: the one you ran |
| `--no-install` | Skip installing |
| `--no-git` | Skip creating a git repository |
| `-y`, `--yes` | Ask nothing and use the defaults, for scripts and AI agents |

The folder must be new or empty. Inside an existing git repository, the site is added as a folder and no new repository is made.

## What you get

The [default BearMinion template](https://github.com/langehelp-software/bearminion/tree/main/templates/default): an Astro and Tailwind site with ten section types, the [`bearminion`](https://www.npmjs.com/package/bearminion) editor at the same version as this package, and content as JSON files you own and commit. The template ships inside this package, so it works offline and always matches its editor.

## Learn more

- [BearMinion on GitHub](https://github.com/langehelp-software/bearminion)
- [Documentation](https://github.com/langehelp-software/bearminion/blob/main/docs/README.md)

## License

[MIT](https://github.com/langehelp-software/bearminion/blob/main/LICENSE) © Jakub Lange
