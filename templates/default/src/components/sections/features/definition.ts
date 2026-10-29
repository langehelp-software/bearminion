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
  guide: `
    Use it for the three to six benefits that matter most. It is the wrong section for a sequence (use Steps), a plan comparison (use Pricing) or plain facts with numbers (use Stats).

    Write each title as the benefit in under five words and each description as one or two sentences about what the visitor gets, not how it is built. Give every item a picture or none: a mix looks uneven.

    Pick cards for equal items in a row. Pick bento when one item is the main one: the first card is large, so put the most important item first and use four or six items. Pick list for text-led items with longer descriptions: the heading sits left and the items read as a numbered list.
  `,
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
