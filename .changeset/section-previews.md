---
'create-bearminion': patch
---

The starter's dev server shows one section alone at `/section-preview/<section>/<variant>` (such as `/section-preview/text-image/right`), with its default content and no header or footer, next to `/style-guide` and `/variants`. The docs show these pages live on each section page. `Base.astro` takes `chrome={false}` for a page that is only its sections. Like the other workshops, a build leaves the route out.

New sections start fuller: Stats with four figures, Testimonials with three quotes, Pricing with three plans, Text + Image with three points and Contact with three details and three topics, as each section recommends. Sections already on a page keep their content.
