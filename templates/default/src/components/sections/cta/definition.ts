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
  guide: `
    Use it as the closing section of a page, with one clear action. Say in the heading what happens on click, keep the text to one sentence, and write the button as a verb. A second, quieter button is for a different path only.

    Pick band for a strong, closing block; it can show the install command beside the text. Pick centered for a simple close, with the command underneath. Pick terminal for developer products: the text sits left and a terminal window shows the command and what it prints. Use real output in it, no invented results.

    Add a command and output only for developer products. For everything else leave them out.
  `,
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
