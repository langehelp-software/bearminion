import type { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { heroWireframe } from './wireframe'

export const heroVariants = ['split', 'centered', 'editorial'] as const

export const heroSchema = withEmphasis({
  eyebrow,
  heading,
  sub: richTextSchema.optional(),
  primary: linkSchema.optional(),
  secondary: linkSchema.optional(),
  image: imageSchema.optional(),
})

export type HeroProps = z.infer<typeof heroSchema>

export const hero = defineSection({
  type: 'hero',
  label: 'Hero',
  description: 'Opening heading, intro, buttons and an image.',
  schema: heroSchema,
  defaults: {
    eyebrow: 'Your tagline',
    heading: 'Say what you do in one line.',
    marks: accent('Say what you do in one line.', 'one line.'),
    sub: 'Use this paragraph to say who it is for and what they get. Keep it to two sentences.',
    primary: { label: 'Primary action', href: '#' },
    secondary: { label: 'Secondary action', href: '#' },
  },
  variants: heroVariants,
  defaultVariant: 'split',
  optional: { props: ['eyebrow', 'heading', 'sub', 'primary', 'secondary', 'image'] },
  wireframe: heroWireframe,
})
