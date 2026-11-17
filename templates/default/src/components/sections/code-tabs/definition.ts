import { z } from 'zod'
import { defineSection, richTextSchema, textSchema, withEmphasis, type CountRule } from 'bearminion'
import { accent, eyebrow, heading } from '../shared'
import { codeTabsWireframe } from './wireframe'

export const codeTabsVariants = ['side', 'top'] as const

/** Two to six tabs, and up to six short points under them. */
export const codeTabsCounts = {
  tabs: { recommended: '3 or 4', min: 2, max: 6 },
  points: { recommended: '3 or 6', min: 0, max: 6 },
} as const satisfies Record<string, CountRule>

export const codeTabSchema = z
  .object({
    title: textSchema,
    /** One sentence under the title. Text in backticks shows as code. */
    description: richTextSchema.optional(),
    /** The file name over the code, such as `src/lib/content-model.ts`, or `terminal`. */
    file: textSchema.optional(),
    /** The code, as it is: line breaks and spaces are kept. A trailing `// note` or `  # note` is drawn as a comment. */
    code: z.string().min(1),
  })
  .strict()

export const codePointSchema = z
  .object({
    title: textSchema,
    /** A sentence or two. Text in backticks shows as code. */
    description: richTextSchema.optional(),
  })
  .strict()

export const codeTabsSchema = withEmphasis({
  eyebrow,
  heading,
  body: richTextSchema.optional(),
  tabs: z.array(codeTabSchema).min(codeTabsCounts.tabs.min).max(codeTabsCounts.tabs.max),
  points: z.array(codePointSchema).max(codeTabsCounts.points.max).optional(),
})

export type CodeTab = z.infer<typeof codeTabSchema>
export type CodePoint = z.infer<typeof codePointSchema>
export type CodeTabsProps = z.infer<typeof codeTabsSchema>

export const codeTabs = defineSection({
  type: 'codeTabs',
  label: 'Code tabs',
  description: 'Code samples in tabs, with numbered points under them.',
  schema: codeTabsSchema,
  defaults: {
    eyebrow: 'For developers',
    heading: 'Show the code, not a diagram.',
    marks: accent('Show the code, not a diagram.', 'not a diagram.'),
    body: 'One tab per idea. Keep each sample short enough to read without scrolling.',
    tabs: [
      {
        title: 'Install it',
        description: 'The one command a reader runs first.',
        file: 'terminal',
        code: '$ npm install example  # one dependency\n$ npx example init      # writes example.config.ts',
      },
      {
        title: 'Configure it',
        description: 'The smallest config that works.',
        file: 'example.config.ts',
        code: "import { defineConfig } from 'example'\n\nexport default defineConfig({\n  name: 'my-site',\n  output: 'static', // or 'server'\n})",
      },
      {
        title: 'Use it',
        description: 'What the reader writes every day.',
        file: 'src/main.ts',
        code: "import { run } from 'example'\n\nawait run() // that is all",
      },
    ],
    points: [
      { title: 'Small on purpose', description: 'Say what the reader does not have to learn.' },
      { title: 'Typed end to end', description: 'Name the guarantee, such as `strict` types.' },
      { title: 'Yours to change', description: 'Say where the code lives and who owns it.' },
    ],
  },
  variants: codeTabsVariants,
  defaultVariant: 'side',
  optional: { props: ['eyebrow', 'heading', 'body', 'points'], items: { tabs: ['description', 'file'], points: ['description'] } },
  counts: codeTabsCounts,
  wireframe: codeTabsWireframe,
})
