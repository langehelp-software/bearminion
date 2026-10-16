import { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { featuresWireframe } from './wireframe'

export const featuresVariants = ['cards', 'list', 'bento'] as const

/** Three to six cards; the bento layout is a fixed four-tile grid. */
export const featuresCounts = {
  items: { recommended: '4 for bento, 3–6 otherwise', min: 3, max: 6, exact: { variant: 'bento', count: 4 } },
} as const satisfies Record<string, CountRule>

export const featureItemSchema = z
  .object({
    title: textSchema,
    description: richTextSchema.optional(),
    image: imageSchema.optional(),
  })
  .strict()

export const featuresSchema = withEmphasis({
  eyebrow,
  heading,
  intro: richTextSchema.optional(),
  link: linkSchema.optional(),
  items: z.array(featureItemSchema).min(featuresCounts.items.min).max(featuresCounts.items.max),
})

export type FeatureItem = z.infer<typeof featureItemSchema>
export type FeaturesProps = z.infer<typeof featuresSchema>

export const features = defineSection({
  type: 'features',
  label: 'Features',
  description: 'Grid of feature cards with titles and text.',
  schema: featuresSchema,
  defaults: {
    eyebrow: 'Features',
    heading: 'Reasons to choose you',
    marks: accent('Reasons to choose you', 'choose you'),
    intro: 'Introduce the list in a sentence. Each card takes a short title and a description.',
    items: [
      { title: 'First benefit', description: 'Describe one benefit in a sentence or two. Lead with what the reader gets.' },
      { title: 'Second benefit', description: 'Keep each description about the same length so the cards line up.' },
      { title: 'Third benefit', description: 'Name a concrete outcome, a number or a time saved.' },
      { title: 'Fourth benefit', description: 'Close with the point that removes the last doubt.' },
    ],
  },
  variants: featuresVariants,
  defaultVariant: 'cards',
  optional: { props: ['eyebrow', 'heading', 'intro', 'link'], items: { items: ['description', 'image'] } },
  counts: featuresCounts,
  wireframe: featuresWireframe,
  refine({ variant, props }, ctx) {
    const { variant: exactVariant, count } = featuresCounts.items.exact
    if (variant === exactVariant && props.items.length !== count) {
      ctx.addIssue({
        code: 'custom',
        message: `The ${exactVariant} variant needs exactly ${count} feature items`,
        path: ['props', 'items'],
      })
    }
  },
})
