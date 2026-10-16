import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { statsWireframe } from './wireframe'

export const statsVariants = ['row', 'cards', 'split'] as const

export const statItemSchema = z
  .object({
    value: textSchema,
    label: textSchema.optional(),
  })
  .strict()

export const statsSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  items: z.array(statItemSchema).min(1),
})

export type StatItem = z.infer<typeof statItemSchema>
export type StatsProps = z.infer<typeof statsSchema>

export const stats = defineSection({
  type: 'stats',
  label: 'Stats',
  description: 'Big numbers with short labels.',
  schema: statsSchema,
  defaults: {
    eyebrow: 'By the numbers',
    heading: 'Figures that build trust.',
    marks: accent('Figures that build trust.', 'build trust.'),
    items: [{ value: '120+', label: 'customers since launch' }],
  },
  variants: statsVariants,
  defaultVariant: 'row',
  optional: { props: ['eyebrow', 'heading', 'body'], items: { items: ['label'] } },
  counts: { items: { recommended: 4 } },
  wireframe: statsWireframe,
})
