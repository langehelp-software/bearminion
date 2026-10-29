import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { defineSection } from '../src/define-section.js'
import { dedent, guideFields, indexGuide, sectionGuide } from '../src/guide/section-guide.js'
import { defineWireframe } from '../src/wireframe.js'
import { sectionRegistry } from './starter.js'

const cards = defineSection({
  type: 'cards',
  label: 'Cards',
  description: 'A row of cards.',
  guide: 'Use the grid variant for four or more cards.',
  schema: z
    .object({
      heading: z.string().min(1).max(60).describe('The claim, not the company name'),
      items: z
        .array(z.object({ title: z.string(), kind: z.enum(['info', 'warning']) }).strict())
        .min(1)
        .max(6),
      note: z.string().optional(),
    })
    .strict(),
  defaults: { heading: 'Heading', items: [{ title: 'One', kind: 'info' }] },
  variants: ['row', 'grid'],
  defaultVariant: 'row',
  optional: { props: ['note'] },
  counts: { items: { recommended: '3 to 4', min: 1, max: 6 } },
  wireframe: defineWireframe([[0, 0, 100, 100, 'card']]),
})

describe('guideFields', () => {
  it('lists fields with type, requirement and limits', () => {
    const rows = guideFields(cards.schema)
    expect(rows.find((row) => row.path === 'heading')).toMatchObject({ type: 'string', required: true })
    expect(rows.find((row) => row.path === 'heading')?.notes).toContain('length 1–60')
    expect(rows.find((row) => row.path === 'heading')?.notes).toContain('The claim, not the company name')
    expect(rows.find((row) => row.path === 'note')?.required).toBe(false)
    expect(rows.find((row) => row.path === 'items[].kind')?.notes).toContain('"warning"')
  })
})

describe('sectionGuide', () => {
  const guide = sectionGuide(cards)

  it('puts the authored guidance first and the generated facts after it', () => {
    expect(guide.indexOf('Use the grid variant')).toBeGreaterThan(-1)
    expect(guide.indexOf('## Guidance')).toBeLessThan(guide.indexOf('## Content'))
  })

  it('names the variants, counts and defaults', () => {
    expect(guide).toContain('`row`, `grid`')
    expect(guide).toContain('`items`: recommended 3 to 4, min 1, max 6')
    expect(guide).toContain('"heading": "Heading"')
  })

  it('treats an empty guide as none', () => {
    const blank = { ...cards, guide: '  ' }
    expect(sectionGuide(blank)).not.toContain('## Guidance')
    expect(indexGuide({ blank })).toContain('(no authored guidance)')
  })

  it('is deterministic', () => {
    expect(sectionGuide(cards)).toBe(guide)
  })
})

describe('the starter sections', () => {
  for (const definition of Object.values(sectionRegistry)) {
    it(`${definition.type}: every variant and every fixed choice appears in the guide`, () => {
      const guide = sectionGuide(definition)
      for (const variant of definition.variants) expect(guide).toContain(`\`${variant}\``)
      for (const choices of Object.values(definition.choices)) {
        for (const choice of choices) expect(guide).toContain(JSON.stringify(choice))
      }
    })
  }

  it('the index lists every section once', () => {
    const index = indexGuide(sectionRegistry)
    for (const type of Object.keys(sectionRegistry)) expect(index.match(new RegExp(`^- \`${type}\``, 'gm'))).toHaveLength(1)
  })
})

describe('dedent', () => {
  it('removes the common indent of a template literal and its blank ends', () => {
    expect(dedent('\n    First.\n\n      Indented.\n  ')).toBe('First.\n\n  Indented.')
  })

  it('returns nothing for a blank guide', () => {
    expect(dedent('  \n ')).toBeUndefined()
    expect(dedent(undefined)).toBeUndefined()
  })
})

describe('the starter guides', () => {
  it('has an authored guide for every section, with no placeholder left', () => {
    for (const definition of Object.values(sectionRegistry)) {
      expect(dedent(definition.guide), definition.type).toBeDefined()
    }
  })
})
