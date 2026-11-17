import { z } from 'zod'
import { defineSection, textSchema } from 'bearminion'
import { editorDemoWireframe } from './wireframe'

/**
 * bearminion.com only: a working mock of the editor, editing a sample bakery site, with the git diff of what a save
 * writes. It lives in apps/web/sections, not in templates/default, so it is not in the registry and no other site gets
 * it (apps/web/scripts/sync-template.mjs copies it in next to the template's sections).
 */
export const editorDemoVariants = ['framed'] as const

export const trustItemSchema = z
  .object({
    label: textSchema,
    /** Makes the item a link. */
    href: z.string().min(1).optional(),
  })
  .strict()

export const editorDemoSchema = z
  .object({
    /** The short facts under the demo, such as "MIT licensed". */
    trust: z.array(trustItemSchema).max(6).optional(),
  })
  .strict()

export type EditorDemoProps = z.infer<typeof editorDemoSchema>

export const editorDemo = defineSection({
  type: 'editorDemo',
  label: 'Editor demo',
  description: 'A working mock of the editor, with the diff a save writes.',
  schema: editorDemoSchema,
  defaults: {
    trust: [{ label: 'MIT licensed' }, { label: '0 KB of editor in production' }],
  },
  variants: editorDemoVariants,
  defaultVariant: 'framed',
  optional: { props: ['trust'], items: { trust: ['href'] } },
  wireframe: editorDemoWireframe,
})
