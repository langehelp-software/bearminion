import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { contactWireframe } from './wireframe'

export const contactVariants = ['split', 'card', 'minimal'] as const

export const contactDetailSchema = z
  .object({
    label: textSchema,
    value: textSchema,
    // The built page carries the value scrambled and a few lines of script show it, so a crawler that only reads the HTML finds none.
    hideFromCrawlers: z.boolean().optional(),
  })
  .strict()

export const contactSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  details: z.array(contactDetailSchema),
  topics: z.array(textSchema),
  note: richTextSchema.optional(),
  thanks: richTextSchema.optional(),
})

export type ContactDetail = z.infer<typeof contactDetailSchema>
export type ContactProps = z.infer<typeof contactSchema>

export const contact = defineSection({
  type: 'contact',
  label: 'Contact',
  description: 'Contact details beside a form.',
  schema: contactSchema,
  defaults: {
    eyebrow: 'Contact',
    heading: 'Get in touch.',
    marks: accent('Get in touch.', 'in touch.'),
    body: 'Tell people what they can contact you about and when they will hear back.',
    details: [{ label: 'Email', value: 'hello@example.com', hideFromCrawlers: false }],
    topics: ['General'],
    note: 'We only use your details to reply to you.',
    thanks: 'Thanks, your message is on its way.',
  },
  variants: contactVariants,
  defaultVariant: 'split',
  // The form posts to /api/contact: the handler is `src/forms/contact.ts`, written in code, never configured here.
  form: 'contact',
  optional: { props: ['eyebrow', 'heading', 'body', 'note', 'thanks'], items: { details: ['hideFromCrawlers'] } },
  counts: { details: { recommended: 3 }, topics: { recommended: 3 } },
  wireframe: contactWireframe,
})
