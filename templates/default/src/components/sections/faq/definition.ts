import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { faqWireframe } from './wireframe'

export const faqVariants = ['accordion', 'split', 'grid'] as const

/** Four to eight questions. */
export const faqCounts = {
  items: { recommended: '4–8', min: 4, max: 8 },
} as const satisfies Record<string, CountRule>

export const faqItemSchema = z
  .object({
    q: textSchema,
    a: richTextSchema,
  })
  .strict()

export const faqSchema = withEmphasis({
  eyebrow,
  heading,
  more: textSchema.optional(),
  items: z.array(faqItemSchema).min(faqCounts.items.min).max(faqCounts.items.max),
})

export type FaqItem = z.infer<typeof faqItemSchema>
export type FaqProps = z.infer<typeof faqSchema>

export const faq = defineSection({
  type: 'faq',
  label: 'FAQ',
  description: 'Questions that open to show answers.',
  schema: faqSchema,
  defaults: {
    eyebrow: 'FAQ',
    heading: 'Questions, answered plainly.',
    marks: accent('Questions, answered plainly.', 'plainly.'),
    items: [
      { q: 'What is included?', a: 'Answer the question people ask most before they buy, in two or three sentences.' },
      { q: 'How long does it take to get started?', a: 'Give a realistic time frame and say what the reader needs to have ready.' },
      { q: 'Can I change plans later?', a: 'Explain how upgrades, downgrades and billing changes work.' },
      { q: 'How do I get help?', a: 'List the ways to reach you and how quickly people can expect a reply.' },
    ],
  },
  variants: faqVariants,
  defaultVariant: 'accordion',
  optional: { props: ['eyebrow', 'heading', 'more'] },
  counts: faqCounts,
  wireframe: faqWireframe,
})
