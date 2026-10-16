import type { z } from 'zod'
import { formatContentIssues, type ContentIssue } from './errors.js'
import { motionOption, toneOption, variantOption, type CountRule, type Option } from './section-options.js'
import type { OptionalContent } from './section-optional.js'
import { wireframeIssues, type Wireframe } from './wireframe.js'

/**
 * A registered section type, assembled from the files in its directory.
 *
 * - `schema` validates `props` and is the source for editor forms.
 * - `defaults` is the props object inserted when the section is added.
 * - `variants` / `defaultVariant` are the layouts; they become the section's `variant` field and control.
 * - `options` are all controls the sidebar shows: variant, tone, motion, then the section's own.
 * - `optional` names the props an author may drop.
 * - `counts` holds item-count rules per array prop.
 * - `wireframe` is the thumbnail in the Add section picker.
 */
export interface SectionDefinition<TType extends string = string, TSchema extends z.ZodType = z.ZodType, TVariant extends string = string> {
  readonly type: TType
  readonly label: string
  /** One line shown under the name in the Add section picker. */
  readonly description: string
  readonly schema: TSchema
  readonly defaults: z.infer<TSchema>
  readonly variants: readonly TVariant[]
  readonly defaultVariant: TVariant
  readonly options: readonly Option[]
  readonly optional: OptionalContent
  readonly counts: Readonly<Record<string, CountRule>>
  readonly wireframe: Wireframe
  /** Cross-field rules the schema cannot express, such as a variant that needs an exact item count. */
  refine?(section: { variant: TVariant; props: z.infer<TSchema> }, ctx: z.RefinementCtx): void
}

export interface SectionConfig<TType extends string, TSchema extends z.ZodType, TVariants extends readonly [string, ...string[]]> {
  type: TType
  label: string
  description: string
  schema: TSchema
  defaults: z.infer<TSchema>
  variants: TVariants
  defaultVariant: TVariants[number]
  /** Controls beyond variant, tone and motion, for example a number the section reads. */
  options?: readonly Option[]
  optional: OptionalContent
  counts?: Readonly<Record<string, CountRule>>
  wireframe: Wireframe
  refine?(section: { variant: TVariants[number]; props: z.infer<TSchema> }, ctx: z.RefinementCtx): void
}

export function defineSection<
  const TType extends string,
  TSchema extends z.ZodType,
  const TVariants extends readonly [string, ...string[]],
>(config: SectionConfig<TType, TSchema, TVariants>): SectionDefinition<TType, TSchema, TVariants[number]> {
  const parsed = config.schema.safeParse(config.defaults)
  if (!parsed.success) {
    const issues: ContentIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    }))
    throw new Error(`Invalid defaults for section "${config.type}":\n${formatContentIssues(issues)}`)
  }
  if (!config.variants.includes(config.defaultVariant)) {
    throw new Error(`Section "${config.type}": the default variant "${config.defaultVariant}" is not one of its variants.`)
  }
  const wireIssues = wireframeIssues(config.wireframe)
  if (wireIssues.length > 0) {
    throw new Error(`Invalid wireframe for section "${config.type}":\n${wireIssues.join('\n')}`)
  }

  return Object.freeze({
    type: config.type,
    label: config.label,
    description: config.description,
    schema: config.schema,
    defaults: parsed.data,
    variants: config.variants,
    defaultVariant: config.defaultVariant,
    options: Object.freeze([variantOption(config.variants, config.defaultVariant), toneOption, motionOption, ...(config.options ?? [])]),
    optional: config.optional,
    counts: config.counts ?? {},
    wireframe: config.wireframe,
    refine: config.refine,
  })
}
