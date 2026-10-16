import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { DEFAULT_CONTACT_ANCHOR, accent, eyebrow, heading } from '../shared'
import { pricingWireframe } from './wireframe'

export const pricingVariants = ['tiers', 'table', 'single'] as const

export const pricingPlanSchema = z
  .object({
    name: textSchema,
    blurb: textSchema.optional(),
    monthly: z.number().nonnegative(),
    featured: z.boolean().optional(),
    cta: linkSchema.optional(),
    features: z.array(textSchema),
  })
  .strict()

export const pricingRowSchema = z.array(z.union([z.string(), z.boolean()])).min(2)

export const pricingSchema = withEmphasis({
  eyebrow,
  heading,
  intro: richTextSchema.optional(),
  singleHeading: textSchema.optional(),
  yearlyDiscount: z.number().min(0).max(1).default(0.2),
  plans: z.array(pricingPlanSchema).min(1),
  rows: z.array(pricingRowSchema).optional(),
})

export type PricingPlan = z.infer<typeof pricingPlanSchema>
export type PricingRow = z.infer<typeof pricingRowSchema>
export type PricingProps = z.infer<typeof pricingSchema>

export const pricing = defineSection({
  type: 'pricing',
  label: 'Pricing',
  description: 'Plans side by side, one highlighted.',
  schema: pricingSchema,
  defaults: {
    eyebrow: 'Pricing',
    heading: 'Simple plans, no surprises.',
    marks: accent('Simple plans, no surprises.', 'no surprises.'),
    intro: 'Say what every plan includes, then let the table cover the differences.',
    yearlyDiscount: 0.2,
    plans: [
      {
        name: 'Starter',
        blurb: 'For trying things out.',
        monthly: 0,
        cta: { label: 'Start free', href: `#${DEFAULT_CONTACT_ANCHOR}` },
        features: ['Core features'],
      },
    ],
  },
  variants: pricingVariants,
  defaultVariant: 'tiers',
  options: [{ name: 'yearlyDiscount', label: 'Yearly discount', type: 'number', default: 0.2, min: 0, max: 1 }],
  optional: { props: ['eyebrow', 'heading', 'intro', 'singleHeading'], items: { plans: ['blurb', 'cta'] } },
  counts: { plans: { recommended: 3 } },
  wireframe: pricingWireframe,
})
