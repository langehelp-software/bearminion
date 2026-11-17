import { describe, expect, it } from 'vitest'
import { compare } from '../../templates/default/src/components/sections/compare/definition'
import { sectionSchema } from '../../templates/default/src/components/sections/definitions'

const section = (rows: { label: string; values: string[] }[]) => ({
  id: 'compare',
  type: 'compare',
  variant: 'centered',
  tone: 'base',
  props: { ...compare.defaults, rows },
})

describe('the Compare section', () => {
  it('accepts its defaults', () => {
    expect(sectionSchema.safeParse(section(compare.defaults.rows)).success).toBe(true)
  })

  it('rejects a row with a value missing, and names the row', () => {
    const result = sectionSchema.safeParse(section([{ label: 'Setup', values: ['A', 'B'] }]))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['props', 'rows', 0, 'values'])
    expect(result.error?.issues[0]?.message).toContain('Row "Setup" has 2 values for 3 columns')
  })
})
