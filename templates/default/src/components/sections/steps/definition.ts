import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { stepsWireframe } from './wireframe'

export const stepsVariants = ['columns', 'rail', 'list'] as const

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
      { icon: 'cursor', title: 'Pick', description: 'Name the first thing the reader does.' },
      { icon: 'edit', title: 'Shape', description: 'Say what they change or decide next.' },
      { icon: 'check', title: 'Done', description: 'End with what they have when they finish.' },
    ],
  },
  variants: stepsVariants,
  defaultVariant: 'columns',
  options: [{ name: 'numbered', label: 'Show numbers', type: 'boolean', default: true }],
  optional: { props: ['eyebrow', 'heading', 'body', 'link'], items: { steps: ['description'] } },
  counts: stepsCounts,
  wireframe: stepsWireframe,
})
