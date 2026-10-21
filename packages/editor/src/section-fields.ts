import type { z } from 'zod'
import { fieldKey, type FieldChoices } from './field-rules.js'

/** The parts of zod 4's internal definition the walk reads. */
interface Def {
  type: string
  in?: z.ZodType
  innerType?: z.ZodType
  element?: z.ZodType
  shape?: Record<string, z.ZodType>
  entries?: Record<string, string | number>
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'readonly', 'catch', 'nonoptional'])

function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def
}

/** Strips optional, default, transforms and the like down to the schema that holds the data. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema
  for (let depth = 0; depth < 16; depth++) {
    const def = defOf(current)
    if (def.type === 'pipe' && def.in) current = def.in
    else if (WRAPPERS.has(def.type) && def.innerType) current = def.innerType
    else return current
  }
  return current
}

/** Top-level prop names of a section schema. Empty when `props` is not an object. */
export function schemaProps(schema: z.ZodType): string[] {
  const def = defOf(unwrap(schema))
  return def.type === 'object' && def.shape ? Object.keys(def.shape) : []
}

/**
 * Every string enum inside a section's props, by field key (`kind`, `steps[].icon`).
 * The sidebar offers these as choices instead of a free text box.
 */
export function enumFields(schema: z.ZodType): FieldChoices {
  const found: Record<string, readonly string[]> = {}
  const visit = (node: z.ZodType, path: string) => {
    const def = defOf(unwrap(node))
    if (def.type === 'enum' && def.entries) {
      const values = Object.values(def.entries)
      if (path !== '' && values.every((value) => typeof value === 'string')) found[fieldKey(path)] = values as string[]
      return
    }
    if (def.type === 'array' && def.element) visit(def.element, `${path}.0`)
    else if (def.type === 'object' && def.shape) {
      for (const [key, child] of Object.entries(def.shape)) visit(child, path === '' ? key : `${path}.${key}`)
    }
  }
  visit(schema, '')
  return found
}

/**
 * Every image inside a section's props (an object with `src` and `alt`), by field key (`poster`, `items[].image`).
 * The sidebar offers an image slot for these even while the prop is missing, whatever the prop is called.
 */
export function imageFields(schema: z.ZodType): string[] {
  const found: string[] = []
  const visit = (node: z.ZodType, path: string) => {
    const def = defOf(unwrap(node))
    if (def.type === 'array' && def.element) visit(def.element, `${path}.0`)
    else if (def.type === 'object' && def.shape) {
      if (path !== '' && 'src' in def.shape && 'alt' in def.shape) {
        found.push(fieldKey(path))
        return
      }
      for (const [key, child] of Object.entries(def.shape)) visit(child, path === '' ? key : `${path}.${key}`)
    }
  }
  visit(schema, '')
  return found
}
