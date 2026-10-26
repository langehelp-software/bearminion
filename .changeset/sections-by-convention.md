---
'bearminion': minor
'create-bearminion': minor
---

A section type is now a directory, and nothing else has to be edited. `npx bearminion sync` (new command) writes `definitions.gen.ts` and `components.gen.ts` from the directories under `sections/`; the starter's hand-written `registry.ts` and the `case` per section in `SectionList.astro` are gone. The new `sectionsDir` option makes `astro build`, `astro check` and `astro sync` stop when the generated files are stale, and `astro dev` warn. `npx bearminion sync --check` is the same test for CI.

Sites created before this release keep working as they are. To move one over, copy `definitions.ts`, `SectionList.astro` and `astro.config.ts` from a new site, delete `registry.ts`, run `npx bearminion sync`, and read [Add a section type](https://github.com/langehelp-software/bearminion/blob/main/templates/default/README.md#add-a-section-type).
