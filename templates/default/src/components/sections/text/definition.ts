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
  guide: `
    Use it where reading is the point: an About page, a policy, a long story. For marketing claims use Text + Image or Features instead.

    Pick left for long reading. Pick center when the heading is short and the body is only a paragraph or two. Keep the narrow column on for anything longer than a few paragraphs, since lines of about 65 characters read best. Turn it off only when the text sits alone in a full-width section.

    Use ## headings inside the body to split long text and ### only for a sub-point, never for emphasis. Do not repeat the section heading as the first line of the body.
  `,
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
