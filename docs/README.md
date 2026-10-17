# BearMinion documentation

BearMinion is two things: the [`bearminion`](https://www.npmjs.com/package/bearminion) package (the content model, the Astro integration and the dev-only editor) and the [default template](../templates/default), a complete site you own after creating it. Start with the [repository README](../README.md) to create a site.

| Page | Read it to |
| --- | --- |
| [Content files](content.md) | Edit `site.json` and page JSON by hand, understand what the editor writes, migrate content after a schema change |
| [Building a theme](themes.md) | Define section types, the header and footer, fonts, the live preview and content collections |
| [The editor](editor.md) | Learn every editing feature: inline text, sections, the sidebar tabs, images, drafts, saving, history and git |
| [Astro integration and package](integration.md) | Configure `bearminion()` in `astro.config.ts`, use the entry points, plug in a custom content store |
| [Dev API](dev-api.md) | Call the localhost API the editor uses, with curl examples |

The template's own guide covers its components, SEO, Storybook and [adding a section type](../templates/default/README.md#add-a-section-type).
