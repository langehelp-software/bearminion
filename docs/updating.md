---
title: Update your site
description: "npm update moves the bearminion library, not the files your site was created with. How to bring both up to date: install the release, run status, add what it names, check and commit."
---

A BearMinion site has two parts that update separately:

- **The library**: the `bearminion` package in your `package.json`. It holds the editor, the content model and the Astro integration. `npm install` updates it.
- **Your site's own files**: the sections, components, `src/lib` helpers and page routes that were copied from the starter when the site was created. They are your code from then on, so no package update changes them. A release that fixes one of them, such as a section that draws differently, only reaches your site when you copy the new version in.

The commands below do that copying. They replace a file only when you never changed it, so your own edits are never lost.

## Update

Run these in your site's folder.

1. **Commit first**, so git is the undo.

2. **Install the latest release**:

   ```sh
   npm install bearminion@latest
   ```

   With pnpm, yarn or bun: `pnpm add bearminion@latest`, `yarn add bearminion@latest`, `bun add bearminion@latest`.

3. **See which of your files are behind**:

   ```sh
   npx bearminion status
   ```

   It compares every file of your sections, and the shared files they import (atoms, molecules, `src/lib`), with the release you just installed. It writes nothing. Each file is `current`, `outdated` (you did not change it, the release did), `missing` (new in this release), `edited` (you changed it, the release did not), `conflict` (both changed it) or `differs` (it is not this release's, and the site has no lock file to say who changed it). The full list is in [The command line](cli.md#see-what-is-out-of-date).

4. **Bring them up to date** with the command `status` prints on its last line, for example:

   ```sh
   npx bearminion add features hero media text-image
   ```

   It writes the missing files, replaces the outdated ones and leaves everything else alone. If it lists npm packages a section now needs, run the install command it prints, or pass `--install`.

5. **Look at the files you changed.** A section with a `conflict` or `differs` file is left out of that command, because `add` would stop on it:

   ```sh
   npx bearminion add media --diff        # how your file differs from this release
   npx bearminion add media --overwrite   # take this release's file and drop your changes
   ```

   Merge the release's change into your file by hand when you want to keep your edits.

6. **Check and commit**:

   ```sh
   npx astro check
   npm run build
   ```

   Open the site with `npm run dev`, look at the pages that use the updated sections, and commit.

## What the commands do not update

`status` and `add` handle sections and every file a section imports. A few files belong to no section:

| Files | How to update them |
| --- | --- |
| `src/pages/[...slug].astro`, `src/pages/404.astro`, `src/env.d.ts`, `src/components/seo/Seo.astro` | With the [online editor](hosted-editor.md): `npx bearminion add hosted` updates them along with the other files the editor needs. Without it: copy them from the starter ([`templates/default/src`](https://github.com/langehelp-software/bearminion/tree/main/templates/default/src)) when the release notes name them |
| The route files for [content types](content-types.md) (sites made before 1.21) | `npx bearminion add type --files-only` |
| `astro.config.ts`, `src/components/sections/definitions.ts`, `src/lib/content-model.ts`, your own sections | Never touched. They are yours; the release notes say when one needs a new line |
| `content/` | Nothing to do. When a release changes the content format, the site reads old files as they are and the editor rewrites each one in the new format the next time it saves it (see [Content files](content.md)) |

The release notes in [`CHANGELOG.md`](https://github.com/langehelp-software/bearminion/blob/main/packages/editor/CHANGELOG.md) say which files a release changed.

## How often

- A **patch** release (1.23.1 to 1.23.2) fixes bugs. When the fix is in a site file, `status` shows it.
- A **minor** release (1.23 to 1.24) can bring new sections, options and fixes to site files.
- A **major** release (1 to 2) can change how sites are built, and comes with its own upgrade notes.

Updating every few releases is fine: `status` and `add` recognise files from any release back to 1.0, so skipping releases does not make updating harder. More on releases and the lock file in [The command line](cli.md#versions-and-updates).
