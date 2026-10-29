import { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { textImageWireframe } from './wireframe'

export const textImageVariants = ['right', 'left', 'wide'] as const

export const textImageSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  /** Rich text: bold, italic, links and `code` in backticks. Plain strings render as before. */
  points: z.array(richTextSchema),
  link: linkSchema.optional(),
  image: imageSchema,
})

export type TextImageProps = z.infer<typeof textImageSchema>

export const textImage = defineSection({
  type: 'textImage',
  label: 'Text + Image',
  description: 'Text beside an image, with points and a link.',
  guide: `
    Use it to explain one thing with a picture: how something works, who is behind it, one product detail. For several equal items use Features.

    Keep the points to three short ones and one link as the next step. The picture needs alt text that says what it shows.

    Pick right when text should come first and the picture supports it. Pick left to alternate with a previous Text + Image section so the page zig-zags. Pick wide when the picture is a wide screenshot or panorama that needs the full width under the text.
  `,
  schema: textImageSchema,
  defaults: {
    eyebrow: 'How it works',
    heading: 'Explain it in three steps.',
    marks: accent('Explain it in three steps.', 'three steps.'),
    body: 'A paragraph that walks through how it works, from the first contact to the result.',
    points: ['Step one: what happens first'],
    link: { label: 'Learn more', href: '#' },
    image: { src: 'placeholder', alt: '' },
  },
  variants: textImageVariants,
  defaultVariant: 'right',
  optional: { props: ['eyebrow', 'heading', 'body', 'link'] },
  counts: { points: { recommended: 3 } },
  wireframe: textImageWireframe,
})
