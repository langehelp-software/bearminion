---
title: BearMinion documentation
description: "What BearMinion is made of, and where to read about each part: the editor, content files, themes, the Astro integration and the dev API."
---

BearMinion is three things: the [`bearminion`](https://www.npmjs.com/package/bearminion) package (the content model, the Astro integration and the dev-only editor), the [default template](../templates/default), a complete site you own after creating it, and [`create-bearminion`](../packages/create-bearminion), which copies that template into a new folder (`npm create bearminion@latest`). New here? Start with [Getting started](getting-started.md): create a site, edit it and put it online in a few minutes.

| Page | Read it to |
| --- | --- |
| [Getting started](getting-started.md) | Create a site with `npm create bearminion`, edit it, and deploy it to Vercel, Netlify or Cloudflare |
| [Content files](content.md) | Edit `site.json` and page JSON by hand, understand what the editor writes, migrate content after a schema change |
| [Sections](sections/README.md) | See every section and layout the starter ships, with screenshots, options and what each one holds |
| [Forms](forms/README.md) | Make the Contact form send messages: the handler in `src/forms`, its keys in the environment, the glue for your host, form services, email, Turnstile and spam checks |
| [The command line](cli.md) | Add sections to a site with `npx bearminion add`, what it does with files you changed, the lock file, and `sync` for your own section directories |
| [Building a theme](themes.md) | Define section types, the header and footer, fonts, the live preview and content collections |
| [The editor](editor.md) | Learn every editing feature: inline text, sections, the sidebar tabs, images, drafts, saving, history and git |
| [Astro integration and package](integration.md) | Configure `bearminion()` in `astro.config.ts`, use the entry points, plug in a custom content store |
| [AI assistants (MCP)](mcp.md) | Start the MCP server so an assistant can read the section guides and edit pages, with what it can and cannot do |
| [Dev API](dev-api.md) | Call the localhost API the editor uses, with curl examples |

To start from Astro's own CLI instead, `npm create astro@latest -- --template langehelp-software/bearminion/templates/default my-site` copies the same template as it is in the repository, Storybook and BearMinion branding included.

The template's own guide covers its components, SEO, Storybook and [adding a section type](../templates/default/README.md#add-a-section-type).
