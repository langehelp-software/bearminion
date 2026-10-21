import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fieldKey, isPropShown, sectionFieldKey } from '../src/field-rules.js'
import { defineSection, defineWireframe, imageSchema, withEmphasis } from '../src/index.js'
import { enumFields, imageFields, schemaProps } from '../src/section-fields.js'
import { sectionRegistry } from './starter.js'

describe('field keys', () => {
  it('names list items with []', () => {
    expect(fieldKey('steps.2.icon')).toBe('steps[].icon')
    expect(fieldKey('rows.0.cells.3')).toBe('rows[].cells[]')
    expect(fieldKey('badge.tag')).toBe('badge.tag')
    expect(fieldKey('kind')).toBe('kind')
  })

  it('reads the key from a full draft path, or null outside section props', () => {
    expect(sectionFieldKey('sections.4.props.steps.1.icon')).toBe('steps[].icon')
    expect(sectionFieldKey('sections.4.variant')).toBeNull()
    expect(sectionFieldKey('header.links.0.label')).toBeNull()
  })
})

describe('isPropShown', () => {
  const rules = {
    poster: { kind: 'video' },
    command: { code: ['action', 'chip'] },
    primary: { button: true },
    both: { kind: 'video', button: false },
  } as const
  const options = (values: Record<string, unknown>) => (name: string) => values[name]

  it('shows a prop without a rule', () => {
    expect(isPropShown(rules, 'caption', options({}))).toBe(true)
    expect(isPropShown(undefined, 'poster', options({}))).toBe(true)
  })

  it('compares a choice, a list of choices and an on/off option', () => {
    expect(isPropShown(rules, 'poster', options({ kind: 'video' }))).toBe(true)
    expect(isPropShown(rules, 'poster', options({ kind: 'image' }))).toBe(false)
    expect(isPropShown(rules, 'command', options({ code: 'chip' }))).toBe(true)
    expect(isPropShown(rules, 'command', options({ code: 'off' }))).toBe(false)
    expect(isPropShown(rules, 'primary', options({ button: true }))).toBe(true)
    expect(isPropShown(rules, 'primary', options({ button: false }))).toBe(false)
  })

  it('needs every option in the rule to match', () => {
    expect(isPropShown(rules, 'both', options({ kind: 'video', button: false }))).toBe(true)
    expect(isPropShown(rules, 'both', options({ kind: 'video', button: true }))).toBe(false)
  })
})

describe('enumFields', () => {
  const schema = withEmphasis({
    heading: z.string().optional(),
    kind: z.enum(['a', 'b']).default('a'),
    items: z.array(z.object({ icon: z.enum(['x', 'y']), title: z.string() }).strict()).min(1),
    image: imageSchema.optional(),
    count: z.number(),
  })

  it('finds string enums at the top, inside list items and inside objects, through defaults and transforms', () => {
    const found = enumFields(schema)
    expect(found.kind).toEqual(['a', 'b'])
    expect(found['items[].icon']).toEqual(['x', 'y'])
    expect(found['image.fit']).toEqual(['cover', 'contain', 'auto'])
    expect(found.heading).toBeUndefined()
    expect(found.count).toBeUndefined()
  })

  it('finds images by shape, whatever they are called, without listing their own fields', () => {
    const cards = z.object({ poster: imageSchema.optional(), items: z.array(z.object({ avatar: imageSchema }).strict()) }).strict()
    expect(imageFields(schema)).toEqual(['image'])
    expect(imageFields(cards)).toEqual(['poster', 'items[].avatar'])
  })

  it('lists the top-level props', () => {
    expect(schemaProps(schema)).toEqual(['heading', 'kind', 'items', 'image', 'count', 'em', 'marks'])
  })
})

describe('defineSection field rules', () => {
  const card = {
    type: 'card',
    label: 'Card',
    description: 'A card.',
    schema: z
      .object({
        icon: z.enum(['star', 'heart']),
        kind: z.enum(['video', 'image']).default('video'),
        video: z.string().optional(),
        image: z.string().optional(),
      })
      .strict(),
    defaults: { icon: 'star', kind: 'video' },
    variants: ['plain', 'boxed'],
    defaultVariant: 'plain',
    options: [
      { name: 'kind', label: 'Type', type: 'enum', choices: ['video', 'image'], default: 'video' },
      { name: 'shadow', label: 'Shadow', type: 'boolean', default: false },
      { name: 'size', label: 'Size', type: 'number', default: 1, min: 0, max: 2 },
    ],
    optional: { props: ['video', 'image'] },
    wireframe: defineWireframe([[8, 8, 40, 8, 'title']]),
  } as const

  it('derives choices from the schema and keeps icons and showWhen', () => {
    const definition = defineSection({
      ...card,
      icons: { icon: { star: 'M1 1', heart: 'M2 2' } },
      showWhen: { video: { kind: 'video' }, image: { kind: 'image', variant: ['boxed'], shadow: true } },
    })
    expect(definition.choices).toEqual({ icon: ['star', 'heart'], kind: ['video', 'image'] })
    expect(definition.icons.icon?.heart).toBe('M2 2')
    expect(definition.showWhen.image).toEqual({ kind: 'image', variant: ['boxed'], shadow: true })
  })

  it('defaults to no icons and no rules', () => {
    const definition = defineSection(card)
    expect(definition.icons).toEqual({})
    expect(definition.showWhen).toEqual({})
  })

  it('rejects icons for a field without choices, a missing icon and an unknown choice', () => {
    expect(() => defineSection({ ...card, icons: { video: { a: 'M1 1' } } })).toThrow(/icons\.video: no field "video" with fixed choices/)
    expect(() => defineSection({ ...card, icons: { icon: { star: 'M1 1' } } })).toThrow(/icons\.icon: no icon for "heart"/)
    expect(() => defineSection({ ...card, icons: { icon: { star: 'M1 1', heart: 'M2 2', moon: 'M3 3' } } })).toThrow(
      /"moon" is not one of its choices/,
    )
  })

  it('rejects showWhen rules that name a missing prop or option, or a value the option cannot have', () => {
    expect(() => defineSection({ ...card, showWhen: { poster: { kind: 'video' } } })).toThrow(/showWhen\.poster: no prop "poster"/)
    expect(() => defineSection({ ...card, showWhen: { kind: { variant: 'boxed' } } })).toThrow(/"kind" is an option/)
    expect(() => defineSection({ ...card, showWhen: { video: { layout: 'x' } } })).toThrow(/no option "layout"/)
    expect(() => defineSection({ ...card, showWhen: { video: { kind: 'audio' } } })).toThrow(/"audio" is not one of video, image/)
    expect(() => defineSection({ ...card, showWhen: { video: { kind: [] } } })).toThrow(/use one of video, image/)
    expect(() => defineSection({ ...card, showWhen: { video: { shadow: 'on' } } })).toThrow(/use true or false/)
    expect(() => defineSection({ ...card, showWhen: { video: { kind: true } } })).toThrow(/use one of video, image/)
    expect(() => defineSection({ ...card, showWhen: { video: { size: 'big' } } })).toThrow(/only choice and on\/off options/)
  })
})

describe('starter field rules', () => {
  it('gives every step icon a picker icon', () => {
    const steps = sectionRegistry.steps
    expect(Object.keys(steps.icons['steps[].icon'] ?? {})).toEqual(steps.choices['steps[].icon'])
  })

  it('shows Media fields for the chosen type and the heading only when it is on', () => {
    const rules = sectionRegistry.media.showWhen
    const read = (kind: string, intro: boolean) => (name: string) => (name === 'kind' ? kind : name === 'intro' ? intro : undefined)
    const shown = (kind: string, intro: boolean) =>
      ['eyebrow', 'heading', 'body', 'video', 'poster', 'label', 'image', 'caption'].filter((prop) =>
        isPropShown(rules, prop, read(kind, intro)),
      )
    expect(shown('video', true)).toEqual(['eyebrow', 'heading', 'body', 'video', 'poster', 'label', 'caption'])
    expect(shown('image', false)).toEqual(['image', 'caption'])
  })
})
