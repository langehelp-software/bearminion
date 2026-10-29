import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { DEFAULT_CONTACT_ANCHOR, accent, eyebrow, heading } from '../shared'
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
  /** The link under the heading in the split layout, such as one to the contact section. */
  link: linkSchema.optional(),
  items: z.array(faqItemSchema).min(faqCounts.items.min).max(faqCounts.items.max),
})

export type FaqItem = z.infer<typeof faqItemSchema>
export type FaqProps = z.infer<typeof faqSchema>

export const faq = defineSection({
  type: 'faq',
  label: 'FAQ',
  description: 'Questions that open to show answers.',
  guide: `
    Use it to answer the real questions that hold visitors back before they buy or get in touch. For long documentation use Text instead.

    Write each question as a visitor would ask it, and start each answer with the answer, then the detail. Put the most asked questions first. Four to eight questions is enough: past that, the page needs better structure instead.

    Pick accordion when answers are long: one opens at a time and the page stays short. Pick grid when answers are one or two sentences, so everything shows at once. Pick split when you want a link beside the questions, such as "Still stuck? Contact us" to the contact section.
  `,
  schema: faqSchema,
  defaults: {
    eyebrow: 'FAQ',
    heading: 'Questions, answered plainly.',
    marks: accent('Questions, answered plainly.', 'plainly.'),
    link: { label: 'Contact us', href: `#${DEFAULT_CONTACT_ANCHOR}` },
    items: [
      { q: 'What is included?', a: 'Answer the question people ask most before they buy, in two or three sentences.' },
      { q: 'How long does it take to get started?', a: 'Give a realistic time frame and say what the reader needs to have ready.' },
      { q: 'Can I change plans later?', a: 'Explain how upgrades, downgrades and billing changes work.' },
      { q: 'How do I get help?', a: 'List the ways to reach you and how quickly people can expect a reply.' },
    ],
  },
  variants: faqVariants,
  defaultVariant: 'accordion',
  optional: { props: ['eyebrow', 'heading', 'more', 'link'] },
  counts: faqCounts,
  wireframe: faqWireframe,
})
