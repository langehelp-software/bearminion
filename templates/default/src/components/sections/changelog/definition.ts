import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { changelogWireframe } from './wireframe'

export const changelogVariants = ['cards', 'timeline'] as const

/** The latest releases, newest first. */
export const changelogCounts = {
  releases: { recommended: 3, min: 1, max: 6 },
} as const satisfies Record<string, CountRule>

/** One to six changes per release. */
const ITEMS = { min: 1, max: 6 } as const

export const releaseSchema = z
  .object({
    /** The version, such as `1.4` or `v2.0.1`. The first release is shown as the latest. */
    version: textSchema,
    /** When it shipped, as you want it written: `12 March 2026`, `March`. */
    date: textSchema.optional(),
    /** A short commit hash or tag, shown beside the version. */
    ref: textSchema.optional(),
    title: textSchema,
    /** What changed, one line each. Text in backticks shows as code. */
    items: z.array(richTextSchema).min(ITEMS.min).max(ITEMS.max),
    /** Where the full notes are, such as the release on GitHub. */
    link: linkSchema.optional(),
  })
  .strict()

export const changelogSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  /** A link beside the heading to every release. */
  link: linkSchema.optional(),
  releases: z.array(releaseSchema).min(changelogCounts.releases.min).max(changelogCounts.releases.max),
})

export type Release = z.infer<typeof releaseSchema>
export type ChangelogProps = z.infer<typeof changelogSchema>

export const changelog = defineSection({
  type: 'changelog',
  label: 'Changelog',
  description: 'The latest releases, each with what changed.',
  schema: changelogSchema,
  defaults: {
    eyebrow: 'Changelog',
    heading: 'What shipped lately.',
    marks: accent('What shipped lately.', 'lately.'),
    link: { label: 'All releases', href: '#' },
    releases: [
      {
        version: '2.1',
        date: 'This month',
        title: 'Name the headline change',
        items: [
          'Say what a reader can do now that they could not before.',
          'One line per change, starting with the benefit.',
          'Name a command or setting in `backticks`.',
        ],
        link: { label: 'Read more', href: '#' },
      },
      {
        version: '2.0',
        date: 'Last month',
        title: 'A bigger release',
        items: [
          'Lead with what changed for the reader.',
          'Say what they have to do, if anything.',
          'Leave the internals for the full notes.',
        ],
        link: { label: 'Read more', href: '#' },
      },
      {
        version: '1.9',
        date: 'Earlier',
        title: 'A small fix, said plainly',
        items: ['What was broken.', 'What works now.', 'Who it affected.'],
        link: { label: 'Read more', href: '#' },
      },
    ],
  },
  variants: changelogVariants,
  defaultVariant: 'cards',
  optional: { props: ['eyebrow', 'heading', 'body', 'link'], items: { releases: ['date', 'ref', 'link'] } },
  counts: changelogCounts,
  wireframe: changelogWireframe,
})
