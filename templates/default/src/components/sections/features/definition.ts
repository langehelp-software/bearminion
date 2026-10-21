import { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { featuresWireframe } from './wireframe'

export const featuresVariants = ['cards', 'list', 'bento'] as const

/** Three to six cards. In the bento grid, four keeps a wide fourth card; any other count fills rows of three. */
export const featuresCounts = {
  items: { recommended: '3–6; 4 or 6 fill the bento grid best', min: 3, max: 6 },
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
})
