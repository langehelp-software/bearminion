import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { defineSection } from '../src/define-section.js'
import { createSectionSchema } from '../src/section-schema.js'
import { defineWireframe } from '../src/wireframe.js'

const text = defineSection({
  type: 'text',
  label: 'Text',
  description: 'Text.',
  schema: z.object({ body: z.string() }).strict(),
  defaults: { body: 'Hello' },
  variants: ['left'],
  defaultVariant: 'left',
  optional: { props: [] },
  wireframe: defineWireframe([[0, 0, 100, 100, 'card']]),
})

describe('section spacing', () => {
  const schema = createSectionSchema({ text })
  const section = (extra: Record<string, unknown> = {}) => ({ id: 'intro', type: 'text', props: { body: 'Hello' }, ...extra })

  it('leaves spacing unset on a section written before it existed', () => {
    const result = schema.parse(section())
    expect(result.spaceTop).toBeUndefined()
    expect(result.spaceBottom).toBeUndefined()
    expect(Object.keys(result)).not.toContain('spaceTop')
  })

  it('keeps each setting', () => {
    for (const value of ['none', 'half', 'full']) {
      const result = schema.parse(section({ spaceTop: value, spaceBottom: value }))
      expect(result.spaceTop).toBe(value)
      expect(result.spaceBottom).toBe(value)
    }
  })

  it('rejects a number or an unknown token', () => {
    expect(schema.safeParse(section({ spaceTop: 0.5 })).success).toBe(false)
    expect(schema.safeParse(section({ spaceBottom: 'double' })).success).toBe(false)
  })
})
