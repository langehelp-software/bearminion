import { z } from 'zod'
import { defineSection, imageSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { testimonialsWireframe } from './wireframe'

export const testimonialsVariants = ['grid', 'featured', 'carousel'] as const

export const testimonialItemSchema = z
  .object({
    quote: richTextSchema,
    name: textSchema,
    role: textSchema.optional(),
    image: imageSchema.optional(),
  })
  .strict()

export const testimonialsSchema = withEmphasis({
  eyebrow,
  heading,
  items: z.array(testimonialItemSchema).min(1),
})

export type TestimonialItem = z.infer<typeof testimonialItemSchema>
export type TestimonialsProps = z.infer<typeof testimonialsSchema>

export const testimonials = defineSection({
  type: 'testimonials',
  label: 'Testimonials',
  description: 'Quotes with a name and avatar.',
  schema: testimonialsSchema,
  defaults: {
    eyebrow: 'Testimonials',
    heading: 'What people say',
    marks: accent('What people say', 'people say'),
    items: [{ quote: 'A short quote from a happy customer, in their own words.', name: 'Alex Morgan', role: 'Role, Company' }],
  },
  variants: testimonialsVariants,
  defaultVariant: 'grid',
  optional: { props: ['eyebrow', 'heading'], items: { items: ['role', 'image'] } },
  counts: { items: { recommended: 3 } },
  wireframe: testimonialsWireframe,
})
