import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { DEFAULT_CONTACT_ANCHOR, accent, eyebrow, heading } from '../shared'
import { currencyPositions } from '../../../lib/format-price'
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
  /** The symbol or code shown with every price: `$`, `€`, `zł`, `CHF`. */
  currency: z.string().trim().min(1).max(8).default('$'),
  currencyPosition: z.enum(currencyPositions).default('prefix'),
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
  guide: `
    Use it to let the visitor compare plans and pick one. Three plans is the sweet spot. Mark exactly one plan as featured: the one you want most people to choose.

    List features in the same order and with parallel wording in every plan, starting with what is included. Monthly is the price as a plain number; currency sets the symbol or code shown with it, and currencyPosition puts it before (prefix, $9) or after (suffix, 9 zł) the number. A plan with 0 shows "forever", which suits a free plan. Set yearlyDiscount to the real discount, where 0.2 is 20 percent off; the monthly and yearly switch is always shown.

    Pick tiers for two to four plans as cards, the featured one in dark. Pick table when plans differ feature by feature: fill rows with a label, then one value per plan, either text or a tick. Pick single to present one plan: it shows only the featured plan, large, with its features beside it, so mark that plan featured. singleHeading replaces the plan name above the price.
  `,
  schema: pricingSchema,
  defaults: {
    eyebrow: 'Pricing',
    heading: 'Simple plans, no surprises.',
    marks: accent('Simple plans, no surprises.', 'no surprises.'),
    intro: 'Say what every plan includes, then let the table cover the differences.',
    yearlyDiscount: 0.2,
    currency: '$',
    currencyPosition: 'prefix',
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
  options: [
    { name: 'yearlyDiscount', label: 'Yearly discount', type: 'number', default: 0.2, min: 0, max: 1 },
    { name: 'currency', label: 'Currency', type: 'string', default: '$' },
    { name: 'currencyPosition', label: 'Currency position', type: 'enum', choices: currencyPositions, default: 'prefix' },
  ],
  optional: { props: ['eyebrow', 'heading', 'intro', 'singleHeading'], items: { plans: ['blurb', 'cta'] } },
  counts: { plans: { recommended: 3 } },
  wireframe: pricingWireframe,
})
