---
'bearminion': minor
'create-bearminion': minor
---

`npx bearminion guide [section]` prints how to fill this site's sections: the list of sections the site really has, or one section's variants, options, fields, limits and defaults, generated from its definition so it cannot drift from the schema. `defineSection` takes an optional `guide` for what the schema cannot say. The guide reads the site's own `src/lib/content-model.ts`, so a site on an older release gets the sections it has. Every starter section now ships a guide.

`npx bearminion mcp` (experimental) starts a local MCP server over stdio: an assistant reads the section guides and lists, reads, saves, creates, renames, deletes and re-homes pages, uploads images and videos from the project or from folders you allow with `--uploads-from`, or asks you for an image with a one-time local link and a file picker (`request_upload`), with every write checked by the same schemas as the editor. A new site has no MCP server: `npx bearminion add mcp` installs its one dependency, `@modelcontextprotocol/sdk` (an optional peer), as a dev dependency with the site's package manager, and prints how to connect an assistant.

The Pricing section takes a `currency` and a `currencyPosition` (`prefix` or `suffix`).
