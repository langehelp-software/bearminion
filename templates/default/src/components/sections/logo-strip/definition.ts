import { z } from 'zod'
import { defineSection, imageSchema, textSchema } from 'bearminion'
import { logoStripWireframe } from './wireframe'

export const logoStripVariants = ['row', 'grid', 'marquee'] as const

export const logoStripSchema = z
  .object({
    label: textSchema.optional(),
    logos: z.array(imageSchema).min(1),
  })
  .strict()

export type LogoStripProps = z.infer<typeof logoStripSchema>

export const logoStrip = defineSection({
  type: 'logoStrip',
  label: 'Logo strip',
  description: 'A row of customer or partner logos.',
  schema: logoStripSchema,
  defaults: {
    label: 'Trusted by teams like yours',
    logos: [1, 2, 3, 4, 5, 6].map((n) => ({ src: 'placeholder', alt: `Partner logo ${n}` })),
  },
  variants: logoStripVariants,
  defaultVariant: 'row',
  optional: { props: ['label'] },
  counts: { logos: { recommended: 6 } },
  wireframe: logoStripWireframe,
})
