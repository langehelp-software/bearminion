import { z } from 'zod'
import { defineSection, imageSchema, linkSchema, richTextSchema, textSchema, withEmphasis } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { heroWireframe } from './wireframe'

export const heroVariants = ['split', 'centered', 'editorial'] as const

/**
 * How the install command shows. `off` hides it. `action` is a pill in the button row that takes the secondary
 * button's place, `chip` a smaller pill under the buttons, `terminal` a dark block under the buttons.
 */
export const heroCodeStyles = ['off', 'action', 'chip', 'terminal'] as const

/** A linked pill with a short tag, such as "1.2 · Available now". It takes the eyebrow's place in split and centered. */
export const heroBadgeSchema = z
  .object({
    tag: textSchema.optional(),
    text: textSchema,
    href: z.string().min(1),
  })
  .strict()

export const heroSchema = withEmphasis({
  eyebrow,
  heading,
  sub: richTextSchema.optional(),
  badge: heroBadgeSchema.optional(),
  primary: linkSchema.optional(),
  secondary: linkSchema.optional(),
  /** Off hides the primary button and keeps it in the file, for a page whose only action is the command. */
  button: z.boolean().default(true),
  /** The shell command the Copy button copies, such as `npm create bearminion@latest`. */
  command: textSchema.optional(),
  code: z.enum(heroCodeStyles).default('off'),
  /** A soft light in the accent color behind the heading. It follows the tone and the site palette. */
  glow: z.boolean().default(false),
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
    button: true,
    command: 'npm create astro@latest',
    code: 'off',
    glow: false,
  },
  variants: heroVariants,
  defaultVariant: 'split',
  options: [
    { name: 'button', label: 'Primary button', type: 'boolean', default: true },
    { name: 'code', label: 'Install command', type: 'enum', choices: heroCodeStyles, default: 'off' },
    { name: 'glow', label: 'Background glow', type: 'boolean', default: false },
  ],
  optional: { props: ['eyebrow', 'heading', 'sub', 'badge', 'primary', 'secondary', 'command', 'image'] },
  wireframe: heroWireframe,
})
