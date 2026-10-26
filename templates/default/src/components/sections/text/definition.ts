import { z } from 'zod'
import { defineSection, richTextSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { textWireframe } from './wireframe'

export const textVariants = ['left', 'center'] as const

export const textSchema = withEmphasis({
  eyebrow,
  heading,
  /** Long-form text. Besides bold, italic, links, code and lists it may hold `##` and `###` headings. */
  body: richTextSchema,
  /** On: a readable column about 65 characters wide. Off: the full width of the page. */
  narrow: z.boolean().default(true),
})

export type TextProps = z.infer<typeof textSchema>

export const text = defineSection({
  type: 'text',
  label: 'Text',
  description: 'Plain long-form text with headings, lists and links. For an About, a policy or any simple page.',
  schema: textSchema,
  defaults: {
    eyebrow: 'About',
    heading: 'A page of plain words.',
    marks: accent('A page of plain words.', 'plain words.'),
    body: 'Write as much as you need. Select a few words to make them **bold**, *italic* or a link.\n\n## A heading\n\nHeadings split a long page into parts a reader can scan.\n\n- Lists work too\n- With as many items as you need',
    narrow: true,
  },
  variants: textVariants,
  defaultVariant: 'left',
  options: [{ name: 'narrow', label: 'Narrow column (easier to read)', type: 'boolean', default: true }],
  optional: { props: ['eyebrow', 'heading'] },
  wireframe: textWireframe,
})
