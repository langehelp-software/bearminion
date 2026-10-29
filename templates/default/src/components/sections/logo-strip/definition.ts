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
  guide: `
    Social proof directly under the hero: names the visitor recognizes. Use only customers or partners you may name. With fewer than four logos it looks thin: use Stats or Testimonials instead.

    Pick row for five to eight logos in a single line under a short label. Pick grid for eight or more, or when logos differ in width and need a ruled cell each. Pick marquee only for ten or more logos on a page where motion is fine; it scrolls sideways and pauses on hover or focus, and with few logos it looks empty.

    Keep the label factual and short ("Trusted by", "Used at"). Every logo needs alt text: the company name. Use logos of similar height and one color treatment, since mixed styles look noisy.
  `,
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
