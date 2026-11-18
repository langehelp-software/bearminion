---
title: BearMinion documentation
description: "Where to start, and where each part of BearMinion is documented: creating and updating a site, the editor, sections, forms, themes and the API."
---

BearMinion is an Astro website you edit by clicking on it. Your content is plain files in your repository, the editor runs on your computer (or online, for people without a terminal), and what you publish is a static site.

## Start here

- **[Getting started](getting-started.md)**: create a site with `npm create bearminion`, edit it, and put it online on Vercel, Netlify or Cloudflare, in a few minutes.
- **[Update your site](updating.md)**: move to a new release. `npm update` changes the library; `status` and `add` bring your site's own files up to date without touching the ones you changed.

## Edit content

- [The editor](editor.md): every editing feature, from inline text and sections to images, drafts, saving, history and git.
- [Edit online](hosted-editor.md): give editors a web address. They sign in with GitHub and edit in the browser, access follows the repository, and every save is a commit under their name.
- [Content files](content.md): the JSON the editor writes, for editing by hand or by script, and how content is migrated after a schema change.

## Add to your site

- [Sections](sections/README.md): every section and layout, which ones a new site starts with, and the options and content each one takes.
- [Content types](content-types.md): a blog, a news list or a fixed page, with their own fields, a sort order and a paginated listing page.
- [Forms](forms/README.md): make the Contact form send messages, with one page for each host, email, spam checks and troubleshooting.
- [The command line](cli.md): `npx bearminion add` for sections, forms, content types and the online editor, `status` for what is out of date, and the lock file.

## Change the look

- [Build your own section](custom-section.md): a section type step by step, from an empty folder to the Add section picker.
- [Building a theme](themes.md): section types, the header and footer, fonts, the live preview and content collections.

## Reference

- [Astro integration and package](integration.md): the `bearminion()` options in `astro.config.ts`, the entry points, content stores and the hosted entry.
- [Dev API](dev-api.md): the localhost API the editor uses, with curl examples.
- [Markdown collections](collections.md): edit an Astro content collection through the editor API, checked against your Zod schema, with no reformatting of what you did not touch. Experimental: there is no browser editor for it yet.

## Already have an Astro site?

BearMinion is built around a site made from its starter: the click-to-edit editor needs your pages built from sections, with a section registry and a site definition passed to `bearminion()`. It does not install into an existing Astro site.

- **Start a new site and move your content in.** Create one with [Getting started](getting-started.md), then rebuild your pages from its sections or [your own](custom-section.md).
- **Bring your Markdown along (experimental).** [Markdown collections](collections.md) edits a collection's Markdown files through the editor API: each save is checked against the collection's Zod schema and changes only the lines you edited. There is no browser editor for it yet, and it needs the starter's setup (sections and a site definition), so it works in a site made from the starter, not in your current one.

## How BearMinion is put together

BearMinion is made of three parts: [`bearminion`](https://www.npmjs.com/package/bearminion) (the content model, the Astro integration and the editor), the [default template](../templates/default), a complete site you own after creating it, and [`create-bearminion`](../packages/create-bearminion), which copies that template into a new folder.

The template's own guide covers its components, SEO, Storybook and [adding a section type](../templates/default/README.md#add-a-section-type). [Building a theme](themes.md) and [Astro integration and package](integration.md) are the reference for what the editor expects from a site.
