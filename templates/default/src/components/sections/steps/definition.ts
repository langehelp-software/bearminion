import { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { mediaVideoSchema } from '../media/definition'
import { accent, eyebrow, heading } from '../shared'
import { stepIconPaths } from './icons'
import { stepsWireframe } from './wireframe'

export const stepsVariants = ['columns', 'rail', 'list', 'keys', 'panel'] as const

/** The props only the `keys` layout shows: the video beside the steps. */
const KEYS_ONLY = { variant: 'keys' } as const

/** 24px stroke icons; the paths are in `icons.ts`. */
export const stepIcons = ['terminal', 'edit', 'upload', 'moon', 'git', 'check', 'bolt', 'cursor', 'sliders', 'database'] as const

export const stepsCounts = {
  steps: { recommended: '3 or 4', min: 2, max: 6 },
} as const satisfies Record<string, CountRule>

export const stepItemSchema = z
  .object({
    icon: z.enum(stepIcons),
    title: textSchema,
    /** One sentence. Text in backticks shows as code. */
    description: richTextSchema.optional(),
    /**
     * The `keys` layout draws this instead of the icon: keys joined by `+` as keycaps (`Ctrl+E`), or a single word as
     * a word being typed (`Click`).
     */
    keys: textSchema.optional(),
  })
  .strict()

export const stepsSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  link: linkSchema.optional(),
  /** Off: no "01" or "Step 01" over each item, for points that are not a sequence. */
  numbered: z.boolean().default(true),
  steps: z.array(stepItemSchema).min(stepsCounts.steps.min).max(stepsCounts.steps.max),
  /** `keys` layout: a video beside the steps, played on the page. A YouTube or Vimeo link, or a video file. */
  video: mediaVideoSchema.optional(),
  /** `keys` layout: the cover over the video until it plays. */
  poster: imageSchema.optional(),
  /** `keys` layout: a line under the video. */
  caption: textSchema.optional(),
  /** `keys` layout: the video's length beside the caption, such as `0:25`. */
  duration: textSchema.optional(),
})

export type StepItem = z.infer<typeof stepItemSchema>
export type StepsProps = z.infer<typeof stepsSchema>

export const steps = defineSection({
  type: 'steps',
  label: 'Steps',
  description: 'A few short points with an icon each: steps, or reasons.',
  schema: stepsSchema,
  defaults: {
    eyebrow: 'How it works',
    heading: 'Three steps to get going.',
    marks: accent('Three steps to get going.', 'get going.'),
    body: 'Say what the reader does first, then what happens next. Keep each step to one sentence.',
    numbered: true,
    steps: [
      { icon: 'cursor', title: 'Pick', description: 'Name the first thing the reader does.', keys: 'Ctrl+K' },
      { icon: 'edit', title: 'Shape', description: 'Say what they change or decide next.', keys: 'Type' },
      { icon: 'check', title: 'Done', description: 'End with what they have when they finish.', keys: 'Ctrl+Enter' },
    ],
  },
  variants: stepsVariants,
  defaultVariant: 'columns',
  options: [{ name: 'numbered', label: 'Show numbers', type: 'boolean', default: true }],
  optional: {
    props: ['eyebrow', 'heading', 'body', 'link', 'video', 'poster', 'caption', 'duration'],
    items: { steps: ['description', 'keys'] },
  },
  counts: stepsCounts,
  icons: { 'steps[].icon': stepIconPaths },
  showWhen: { video: KEYS_ONLY, poster: KEYS_ONLY, caption: KEYS_ONLY, duration: KEYS_ONLY },
  wireframe: stepsWireframe,
})
