---
title: Build your own section
description: "Step by step: a Timeline section with a list of milestones, from an empty folder to the Add section picker, with the editor's list controls for free."
---

A section type is one folder of three files and one command. This guide builds a **Timeline**: a heading and a list of milestones, each with a year, a title and a sentence. The list is the part that repeats, like the steps in [Steps](sections/steps.md): in the editor it becomes rows you can add, remove and drag, with no editor code from you.

You need a site made with `npm create bearminion@latest` and its dev server (`npm run dev`). Every path below is in that site.

## 1. Make the folder

```sh
mkdir src/components/sections/timeline
```

The folder name is the section's name. It is kebab-case (`timeline`, `team-grid`); the type in your content files is the same name in camelCase (`timeline`, `teamGrid`), and the component is named after it (`Timeline.astro`, `TeamGrid.astro`).

## 2. Describe the content: `definition.ts`

The definition says what a Timeline holds, what a new one starts with, and how the editor shows it. The schema is [Zod](https://zod.dev): it checks every save and builds the fields in the editor's inspector.

```ts
// src/components/sections/timeline/definition.ts
import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { timelineWireframe } from './wireframe'

/** One milestone. The editor shows each one as a row. */
export const milestoneSchema = z
  .object({
    year: textSchema,
    title: textSchema,
    text: richTextSchema.optional(),
  })
  .strict()

export const timelineSchema = withEmphasis({
  eyebrow,
  heading,
  milestones: z.array(milestoneSchema).min(2).max(8),
})

export const timeline = defineSection({
  type: 'timeline',
  label: 'Timeline',
  description: 'Milestones in order: a year, a title and a sentence each.',
  schema: timelineSchema,
  defaults: {
    eyebrow: 'Our story',
    heading: 'How we got here.',
    marks: accent('How we got here.', 'got here.'),
    milestones: [
      { year: '2019', title: 'The idea', text: 'Say what started it.' },
      { year: '2021', title: 'The first customer', text: 'Name the moment it became real.' },
      { year: '2024', title: 'Today', text: 'Say where you are now.' },
    ],
  },
  variants: ['list', 'columns'] as const,
  defaultVariant: 'list',
  optional: { props: ['eyebrow', 'heading'], items: { milestones: ['text'] } },
  counts: { milestones: { recommended: '3 to 5', min: 2, max: 8 } },
  wireframe: timelineWireframe,
})
```

What each part does:

- **`milestoneSchema`** is one item of the list. `textSchema` is a line of plain text, `richTextSchema` allows bold, italic, links and inline code. `.strict()` refuses keys the schema does not name, so a typo in a content file is an error instead of a silently ignored value.
- **`milestones: z.array(...)`** is the repeating field. Any array of objects becomes a list in the inspector. `.min(2).max(8)` is the hard limit a save must meet.
- **`withEmphasis`** adds `marks` next to `heading`: the words drawn in the italic serif ("got here."). `eyebrow` and `heading` come from `shared.ts`, so they behave like every other section's.
- **`defaults`** is what a new Timeline starts with. It must pass the schema, or `astro dev` stops with `Invalid defaults for section "timeline"` and the value that fails. Give lists the number of items you recommend: the defaults are what a person sees first. A new row the editor adds starts as a copy of the first item here, with its text set to "New".
- **`variants`** are the layouts, picked in the inspector. The component draws each one. `defaultVariant` is the layout a new section gets.
- **`optional`** names what an author may clear: `eyebrow` and `heading`, and each milestone's `text`. The editor lets these be emptied and drops them from the file on save; anything not listed stays filled. Name exactly the props that are `.optional()` in the schema. A prop listed here but required in the schema can be emptied and then refuses to save.
- **`counts`** is what the inspector shows next to the list ("4, recommended 3 to 5") and where it stops the Add and Remove buttons.

## 3. Draw the thumbnail: `wireframe.ts`

The Add section picker shows a small sketch of each section. It is rectangles, not a component, because the picker runs in the browser and cannot render Astro.

```ts
// src/components/sections/timeline/wireframe.ts
import { defineWireframe } from 'bearminion'

/** [left %, top %, width %, height %, kind] in a 100 × 100 frame. */
export const timelineWireframe = defineWireframe([
  [8, 12, 44, 8, 'title'],
  [8, 32, 10, 5, 'highlight'],
  [24, 32, 40, 5, 'text'],
  [8, 50, 10, 5, 'highlight'],
  [24, 50, 40, 5, 'text'],
  [8, 68, 10, 5, 'highlight'],
  [24, 68, 40, 5, 'text'],
])
```

The kinds are `title`, `text`, `block`, `button`, `outline`, `card`, `highlight`, `avatar`, `dark`, `light` and `figure`. The editor draws them in a fixed grey scale.

## 4. Render it: `Timeline.astro`

```astro
---
// src/components/sections/timeline/Timeline.astro
import type { Section } from '../definitions'
import Typography from '../../atoms/Typography.astro'
import SectionHeader from '../../molecules/SectionHeader.astro'
import SectionShell from '../../molecules/SectionShell.astro'

interface Props {
  section: Extract<Section, { type: 'timeline' }>
  index: number
  motion?: boolean
}

const { section, index, motion = true } = Astro.props
const props = section.props
// Where a value sits in the page file. The editor uses it to find what you click.
const field = (path: string) => `sections.${index}.props.${path}`
---

<SectionShell id={section.id} anchor={section.anchor} type={section.type} variant={section.variant} tone={section.tone} motion={section.motion ?? motion} spaceTop={section.spaceTop} spaceBottom={section.spaceBottom}>
  <div class="section-container flex flex-col gap-[clamp(2rem,4cqi,3rem)]">
    <SectionHeader eyebrow={props.eyebrow} heading={props.heading} marks={props.marks} size="h2-md" field={field} class="gap-5" />
    <ol class:list={['grid gap-6', section.variant === 'columns' && '@min-[760px]:grid-cols-3']}>
      {
        props.milestones.map((milestone, item) => (
          <li class:list={['flex gap-6', section.variant === 'columns' ? 'flex-col rounded-card bg-surface p-6 ring-line' : 'border-t border-line pt-6']}>
            <span class="w-20 shrink-0 font-mono text-[0.875rem] text-muted" data-field={field(`milestones.${item}.year`)}>
              {milestone.year}
            </span>
            <div class="flex flex-col gap-2">
              <Typography as="h3" size="h3" data-field={field(`milestones.${item}.title`)}>
                {milestone.title}
              </Typography>
              {milestone.text && (
                <Typography as="p" size="body" color="muted" data-field={field(`milestones.${item}.text`)} markdown={milestone.text} />
              )}
            </div>
          </li>
        ))
      }
    </ol>
  </div>
</SectionShell>
```

The parts that matter to the editor:

- **`SectionShell`** draws the section's frame: its `id`, its anchor, the tone's colours, the motion and the spacing (`data-space-top` / `data-space-bottom`). Every section starts with it, so tones, motion and spacing work without you touching them.
- **`section-container`** pads the section top and bottom, scaled by its spacing. A layout that needs other padding adds `section-space` and the same values as `[--section-pt:…]` / `[--section-pb:…]` next to its `pt-*` / `pb-*`, so the editor's 0 · ½ · 1 scales them. A `pt-*` or `pb-*` alone ignores the setting.
- **`data-field`** on every value you want editable on the page. The value is its path in the page file: `sections.2.props.milestones.1.title` is the title of the second milestone in the third section. For list items, put the item's position in the path, as `milestones.${item}.title` does. A value without `data-field` is still edited in the inspector, just not by clicking it on the page.
- **`markdown={milestone.text}`** on `Typography` renders rich text, so bold and links in the sentence show. Plain text fields (`year`, `title`) go in as children.
- **`section-container`**, `rounded-card`, `bg-surface`, `ring-line`, `text-muted` and `border-line` are the theme's classes, so the section follows the site's colours and every tone. `@min-[760px]:` is a container query: the columns layout switches at the section's width, not the window's.

## 5. Register it

```sh
npx bearminion sync
```

It finds every folder in `src/components/sections/` with a `definition.ts` and writes them into `definitions.gen.ts` and `components.gen.ts`. Do not edit those two files; commit them. If you forget this step, `astro dev` warns and `astro build` stops with the same command to run.

## 6. Try it

Restart `npm run dev`, then:

1. Hover a section on the page and choose **Add**, then **Add below**. **Timeline** is in the picker, with its sketch and description.
2. Click it. The section appears with the default milestones.
3. Open **Settings** on its toolbar. The **Milestones** list shows one row per milestone and the count, "3, recommended 3 to 5".
4. Click **+ Add item**. A fourth milestone appears on the page, with "New" in each field. Drag rows by their grip to reorder them, and use the bin to remove one. The buttons stop at 2 and 8.
5. Click a year or a title on the page and type. Switch **Variant** to **Columns** and the tone to **Inverse**.
6. Save. The section is in `content/pages/<page>.json`, under `sections`, exactly as the schema describes it.

To look at it alone, open `/section-preview/timeline/list` and `/section-preview/timeline/columns` on the dev server. `npm run typecheck` checks the component against the schema: a typo such as `milestone.titel` is an error there.

## When something is wrong

| What you see | Why |
| --- | --- |
| `astro dev` stops with `Invalid defaults for section` | A default value fails the schema: a missing required field, a list shorter than `min`, an unknown key under `.strict()` |
| A field cannot be cleared, or a cleared field will not save | `optional` and the schema's `.optional()` calls disagree about it |
| The section is not in the picker | `npx bearminion sync` was not run, or the folder has no `definition.ts`. Restart `npm run dev` after syncing |
| Clicking a value on the page does nothing | Its element has no `data-field`, or the path does not match the schema (`milestones.0.title`, not `milestone.0.title`) |
| A page will not save after you change the schema | Content saved before the change no longer passes. Make the new field optional, or add a [content migration](content.md#content-versions) |

## Next

- [Building a theme](themes.md#section-registry): every `defineSection` option, such as icon grids (`icons`), fields shown only for some layouts (`showWhen`) and image fields.
- [Steps](sections/steps.md) and [Features](sections/features.md) are list sections in the starter. Their folders are good examples to copy from.
- A section you no longer want: delete its folder and run `npx bearminion sync`. Pages that still hold it open in the editor with an "Unknown" section you can delete.
