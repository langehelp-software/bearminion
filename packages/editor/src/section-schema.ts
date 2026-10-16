import { z } from 'zod'
import type { SectionDefinition } from './define-section.js'
import { toneSchema, type Tone } from './fields.js'
import type { SectionRegistry } from './model.js'

export const sectionIdSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/, 'Section id must contain only letters, numbers, "_" and "-"')

export const anchorSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Anchor must be a lowercase slug')

/** The shape every section has, whatever its type. `props` is typed per section by {@link SectionOf}. */
export interface BaseSection {
  id: string
  type: string
  anchor?: string | undefined
  variant: string
  tone: Tone
  motion?: boolean | undefined
  props: unknown
}

type EntryOf<TKey extends string, TDefinition> =
  TDefinition extends SectionDefinition<string, infer TSchema, infer TVariant>
    ? {
        id: string
        type: TKey
        anchor?: string | undefined
        variant: TVariant
        tone: Tone
        motion?: boolean | undefined
        props: z.infer<TSchema>
      }
    : never

/** The section union of a registry: one member per section type, with its own variants and props. */
export type SectionOf<TRegistry extends SectionRegistry> = {
  [TKey in keyof TRegistry & string]: EntryOf<TKey, TRegistry[TKey]>
}[keyof TRegistry & string]

/** Props of one section type in a registry. */
export type PropsOf<TRegistry extends SectionRegistry, TKey extends keyof TRegistry & string> = z.infer<TRegistry[TKey]['schema']>

function sectionEntry(definition: SectionDefinition) {
  const variants = definition.variants as [string, ...string[]]
  return z.object({
    id: sectionIdSchema,
    type: z.literal(definition.type),
    anchor: anchorSchema.optional(),
    variant: z.enum(variants).default(definition.defaultVariant),
    tone: toneSchema,
    motion: z.boolean().optional(),
    props: definition.schema,
  })
}

const cache = new WeakMap<SectionRegistry, z.ZodType>()

/**
 * Validates one section against the registry: the `type` picks the definition, which validates `variant` and `props`.
 * Unknown types fail with the list of registered ones.
 */
export function createSectionSchema<TRegistry extends SectionRegistry>(registry: TRegistry): z.ZodType<SectionOf<TRegistry>> {
  const cached = cache.get(registry)
  if (cached) return cached as z.ZodType<SectionOf<TRegistry>>

  const definitions = Object.values(registry)
  const types = definitions.map((definition) => definition.type)
  const entries = definitions.map(sectionEntry)

  let union: z.ZodType
  if (entries.length >= 2) {
    union = z.discriminatedUnion('type', entries as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]], {
      error: (issue) => {
        if (issue.code !== 'invalid_union') return undefined
        const nested = 'errors' in issue && Array.isArray(issue.errors) ? issue.errors : []
        if (nested.length > 0) return undefined
        const discriminator = 'discriminator' in issue && typeof issue.discriminator === 'string' ? issue.discriminator : 'type'
        const received = readDiscriminator(issue.input, discriminator)
        const expected = types.join(', ')
        return received === undefined
          ? `Unknown section type. Expected one of: ${expected}.`
          : `Unknown section type "${received}". Expected one of: ${expected}.`
      },
    })
  } else if (entries[0]) {
    union = entries[0]
  } else {
    union = z.never()
  }

  const schema = union.superRefine((section, ctx) => {
    const value = section as { type?: string; variant: string; props: unknown }
    const definition = definitions.find((candidate) => candidate.type === value.type)
    definition?.refine?.(value as never, ctx)
  })
  cache.set(registry, schema)
  return schema as unknown as z.ZodType<SectionOf<TRegistry>>
}

/** A section whose `type` the registry does not define. The editor keeps it as it is. */
const orphanSchema = z.looseObject({ id: sectionIdSchema, type: z.string().min(1), anchor: anchorSchema.optional() })

/** True when `section` has a `type` that is not in the registry. */
export function isOrphanSection(registry: SectionRegistry, section: unknown): boolean {
  if (typeof section !== 'object' || section === null || !('type' in section)) return false
  const type = (section as { type: unknown }).type
  return typeof type === 'string' && !Object.hasOwn(registry, type)
}

const tolerantCache = new WeakMap<SectionRegistry, z.ZodType>()

/**
 * Like {@link createSectionSchema}, but a section with an unregistered `type` is accepted as it is (any `props`,
 * extra keys kept) when it has a valid `id`. For the editor, which must open and save a page that still holds
 * a section the site no longer defines. Registered types are validated in full.
 */
export function createTolerantSectionSchema(registry: SectionRegistry): z.ZodType<BaseSection> {
  const cached = tolerantCache.get(registry)
  if (cached) return cached as z.ZodType<BaseSection>
  const strict = createSectionSchema(registry)
  const schema = z.unknown().transform((value, ctx) => {
    const result = (isOrphanSection(registry, value) ? orphanSchema : strict).safeParse(value)
    if (result.success) return result.data
    for (const issue of result.error.issues) {
      ctx.issues.push({ code: 'custom', message: issue.message, path: issue.path, input: value })
    }
    return z.NEVER
  })
  tolerantCache.set(registry, schema)
  return schema as unknown as z.ZodType<BaseSection>
}

function readDiscriminator(input: unknown, discriminator: string | undefined): string | undefined {
  if (!discriminator || typeof input !== 'object' || input === null || !(discriminator in input)) {
    return undefined
  }
  const value = (input as Record<string, unknown>)[discriminator]
  return typeof value === 'string' ? value : undefined
}
