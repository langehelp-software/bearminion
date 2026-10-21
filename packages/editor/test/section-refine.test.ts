import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { defineSection } from '../src/define-section.js'
import { createSectionSchema } from '../src/section-schema.js'
import { defineWireframe } from '../src/wireframe.js'

/** A section with a rule its schema cannot express: the `grid` layout needs exactly four tiles. */
const tiles = defineSection({
  type: 'tiles',
  label: 'Tiles',
  description: 'Tiles.',
  schema: z.object({ items: z.array(z.string()).min(1) }).strict(),
  defaults: { items: ['a', 'b', 'c', 'd'] },
  variants: ['row', 'grid'],
  defaultVariant: 'row',
  optional: { props: [] },
  wireframe: defineWireframe([[0, 0, 100, 100, 'card']]),
  refine({ variant, props }, ctx) {
    if (variant === 'grid' && props.items.length !== 4) {
      ctx.addIssue({ code: 'custom', message: 'The grid layout needs exactly 4 tiles', path: ['props', 'items'] })
    }
  },
})

describe('section refine', () => {
  const schema = createSectionSchema({ tiles })
  const section = (variant: string, items: string[]) => ({ id: 'tiles', type: 'tiles', variant, props: { items } })

  it('runs the definition rule on the parsed section', () => {
    const result = schema.safeParse(section('grid', ['a', 'b']))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('The grid layout needs exactly 4 tiles')
      expect(result.error.issues[0]?.path).toEqual(['props', 'items'])
    }
  })

  it('leaves other layouts and valid counts alone', () => {
    expect(schema.safeParse(section('row', ['a', 'b'])).success).toBe(true)
    expect(schema.safeParse(section('grid', ['a', 'b', 'c', 'd'])).success).toBe(true)
  })
})
