import { z } from 'zod'
import type { SectionDefinition } from '../define-section.js'
import type { Option } from '../section-options.js'

/** The part of a JSON Schema the guide reads. `z.toJSONSchema` is zod's public API, so no internals are touched. */
interface JsonSchema {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  const?: unknown
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  pattern?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
}

export interface GuideField {
  /** `heading`, `items[].title`. The same notation the editor uses for fields. */
  path: string
  type: string
  required: boolean
  /** Limits, fixed choices and the field's description, in one line. */
  notes: string
}

function toJsonSchema(schema: z.ZodType): JsonSchema {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', reused: 'inline' }) as JsonSchema
  } catch {
    return {}
  }
}

function describeType(node: JsonSchema): string {
  const union = node.anyOf ?? node.oneOf
  if (union) return [...new Set(union.map(describeType))].join(' | ')
  if (node.enum) return 'choice'
  if (node.const !== undefined) return JSON.stringify(node.const)
  const type = Array.isArray(node.type) ? node.type.join(' | ') : node.type
  if (type === 'array') return node.items ? `list of ${describeType(node.items)}` : 'list'
  return type ?? 'any'
}

/** Safe-integer bounds are what zod emits for `.int()`; they say nothing to a writer. */
const isLimit = (value: number | undefined): value is number => value !== undefined && Math.abs(value) < Number.MAX_SAFE_INTEGER

function notesOf(node: JsonSchema): string {
  const notes: string[] = []
  if (node.description) notes.push(node.description)
  if (node.enum) notes.push(`one of: ${node.enum.map((value) => JSON.stringify(value)).join(', ')}`)
  if (isLimit(node.maxLength) || (node.minLength ?? 0) > 1) notes.push(`length ${node.minLength ?? 0}–${node.maxLength ?? '∞'}`)
  if (isLimit(node.maxItems) || (node.minItems ?? 0) > 0)
    notes.push(`items ${node.minItems ?? 0}–${isLimit(node.maxItems) ? node.maxItems : '∞'}`)
  if (isLimit(node.minimum) || isLimit(node.maximum)) {
    notes.push(`value ${isLimit(node.minimum) ? node.minimum : '−∞'}–${isLimit(node.maximum) ? node.maximum : '∞'}`)
  }
  if (node.pattern) notes.push(`pattern ${node.pattern}`)
  return notes.join('; ')
}

/** A shape's keys, their types and which are required, without looking into nested shapes: a recursive link is one shape. */
function shallowSignature(shape: Record<string, JsonSchema>, required: string[] | undefined): string {
  return `${Object.entries(shape)
    .map(([key, child]) => `${key}:${describeType(child)}`)
    .join(',')}|${(required ?? []).join(',')}`
}

/**
 * Every field of a section's props, depth first. Lists show their item fields as `items[].field`. A shape that already
 * appeared (a link inside a link's `children`, the same link under `primary` and `secondary`) is listed once; later
 * uses say which field it matches, so the table stays short.
 */
export function guideFields(schema: z.ZodType): GuideField[] {
  const rows: GuideField[] = []
  const seen = new Map<string, string>()
  const visit = (node: JsonSchema, path: string, required: boolean) => {
    const shape = node.items?.properties ?? node.properties
    const signature = shape ? shallowSignature(shape, node.items?.required ?? node.required) : undefined
    const first = signature === undefined || path === '' ? undefined : seen.get(signature)
    if (path !== '') {
      const notes = [notesOf(node), first !== undefined ? `same fields as \`${first}\`` : ''].filter(Boolean).join('; ')
      rows.push({ path, type: describeType(node), required, notes })
    }
    if (first !== undefined) return
    if (signature !== undefined && path !== '') seen.set(signature, path)
    if (node.properties) {
      const requiredKeys = new Set(node.required ?? [])
      for (const [key, child] of Object.entries(node.properties)) visit(child, path === '' ? key : `${path}.${key}`, requiredKeys.has(key))
    } else if (node.items?.properties) {
      const requiredKeys = new Set(node.items.required ?? [])
      for (const [key, child] of Object.entries(node.items.properties)) visit(child, `${path}[].${key}`, requiredKeys.has(key))
    }
  }
  visit(toJsonSchema(schema), '', true)
  return rows
}

/** The guide as a person wrote it inside a template literal: the common indent removed, nothing left when it is blank. */
export function dedent(text: string | undefined): string | undefined {
  const lines = (text ?? '').split('\n')
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.length - line.trimStart().length)
  const indent = indents.length > 0 ? Math.min(...indents) : 0
  const result = lines
    .map((line) => line.slice(indent).trimEnd())
    .join('\n')
    .trim()
  return result === '' ? undefined : result
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function optionLine(option: Option): string {
  const detail =
    option.type === 'enum'
      ? `one of ${option.choices.map((choice) => `\`${choice}\``).join(', ')}`
      : option.type === 'number'
        ? `number ${option.min}–${option.max}`
        : option.type
  return `- \`${option.name}\` (${option.label}): ${detail}, default \`${String(option.default)}\``
}

/**
 * What an assistant needs to fill one section: generated from the definition, so it cannot drift from the schema,
 * followed by the author's own `guide` text for what the schema cannot say.
 */
export function sectionGuide(definition: SectionDefinition): string {
  const lines: string[] = [`# ${definition.label} (\`${definition.type}\`)`, '', definition.description, '']
  const guide = dedent(definition.guide)
  if (guide) lines.push('## Guidance', '', guide, '')

  lines.push(
    '## Section fields',
    '',
    `- \`variant\`: one of ${definition.variants.map((variant) => `\`${variant}\``).join(', ')}; default \`${definition.defaultVariant}\``,
    '- `tone`, `motion`, `anchor`, `id`: set on the section itself, not inside `props`',
  )
  const extras = definition.options.filter((option) => !['variant', 'tone', 'motion'].includes(option.name))
  if (extras.length > 0) lines.push('', '## Options (inside `props`)', '', ...extras.map(optionLine))

  const fields = guideFields(definition.schema)
  if (fields.length > 0) {
    lines.push(
      '',
      '## Content (`props`)',
      '',
      'Required means required inside its parent: an optional object lists its own required fields for when you add it.',
      '',
      '| Field | Type | Required | Notes |',
      '| --- | --- | --- | --- |',
    )
    for (const field of fields) {
      lines.push(`| \`${field.path}\` | ${cell(field.type)} | ${field.required ? 'yes' : 'no'} | ${cell(field.notes)} |`)
    }
  }

  if (fields.some((field) => field.path === 'marks')) {
    lines.push(
      '',
      'To emphasize a phrase in the heading, set `em` to that exact phrase of `heading`. Do not write `marks` by hand: when you change a heading, remove its `marks` and set `em`.',
    )
  }

  const counts = Object.entries(definition.counts)
  if (counts.length > 0) {
    lines.push('', '## Item counts', '')
    for (const [field, rule] of counts) {
      const limits = [
        `recommended ${rule.recommended}`,
        rule.min !== undefined ? `min ${rule.min}` : '',
        rule.max !== undefined ? `max ${rule.max}` : '',
        rule.exact ? `exactly ${rule.exact.count} in \`${rule.exact.variant}\`` : '',
      ].filter(Boolean)
      lines.push(`- \`${field}\`: ${limits.join(', ')}`)
    }
  }

  const showWhen = Object.entries(definition.showWhen)
  if (showWhen.length > 0) {
    lines.push('', '## Fields that only apply for some options', '')
    for (const [prop, conditions] of showWhen) {
      const text = Object.entries(conditions)
        .map(
          ([option, value]) =>
            `\`${option}\` is ${Array.isArray(value) ? value.map((item) => `\`${String(item)}\``).join(' or ') : `\`${String(value)}\``}`,
        )
        .join(' and ')
      lines.push(`- \`${prop}\`: used when ${text}. Otherwise leave it as it is; it keeps its value in the file.`)
    }
  }

  if (definition.form)
    lines.push('', '## Form', '', `Posts to the form handler \`src/forms/${definition.form}.ts\` (\`/api/${definition.form}\`).`)

  lines.push('', '## Defaults', '', '```json', JSON.stringify(definition.defaults, null, 2), '```', '')
  return lines.join('\n')
}

export interface IndexEntry {
  type: string
  label: string
  description: string
  hasGuide: boolean
}

export function indexEntries(registry: Record<string, SectionDefinition>): IndexEntry[] {
  return Object.values(registry)
    .map((definition) => ({
      type: definition.type,
      label: definition.label,
      description: definition.description,
      hasGuide: dedent(definition.guide) !== undefined,
    }))
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
}

/** The entry point: the sections this site really has, one line each, and how to read one. */
export function indexGuide(registry: Record<string, SectionDefinition>): string {
  const entries = indexEntries(registry)
  return [
    '# Sections in this site',
    '',
    "Read one section's guide before writing its content. A page may hold a section whose type is not listed here: leave it as it is.",
    '',
    ...entries.map(
      (entry) => `- \`${entry.type}\`: ${entry.label}. ${entry.description}${entry.hasGuide ? '' : ' (no authored guidance)'}`,
    ),
    '',
  ].join('\n')
}
