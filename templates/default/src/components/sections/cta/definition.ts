import { z } from 'zod'
import { defineSection, linkSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, heading } from '../shared'
import { ctaWireframe } from './wireframe'

export const ctaVariants = ['band', 'centered', 'terminal'] as const

export const ctaLineSchema = z
  .object({
    prompt: textSchema.optional(),
    text: textSchema,
  })
  .strict()

export const ctaSchema = withEmphasis({
  heading,
  body: richTextSchema.optional(),
  command: textSchema.optional(),
  /** Lines the terminal variant shows under the command, such as what it prints. `prompt` is a mark before the line, such as → or ✓. */
  output: z.array(ctaLineSchema).max(8).optional(),
  primary: linkSchema.optional(),
  secondary: linkSchema.optional(),
})

export type CtaProps = z.infer<typeof ctaSchema>

export const cta = defineSection({
  type: 'cta',
  label: 'Call to action',
  description: 'A band with a heading and a button.',
  schema: ctaSchema,
  defaults: {
    heading: 'Ready to get started?',
    marks: accent('Ready to get started?', 'get started?'),
    body: 'One sentence that repeats the main benefit and tells the reader what happens next.',
    command: 'npm create astro@latest',
    output: [
      { text: '# pages live in content/pages' },
      { text: '# site chrome lives in content/site.json' },
      { text: '# production is the static build' },
    ],
    primary: { label: 'Primary action', href: '#' },
    secondary: { label: 'Secondary action', href: '#' },
  },
  variants: ctaVariants,
  defaultVariant: 'band',
  optional: { props: ['heading', 'body', 'command', 'output', 'primary', 'secondary'], items: { output: ['prompt'] } },
  wireframe: ctaWireframe,
})
