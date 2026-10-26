import type { z } from 'zod'
import { formatContentIssues, type ContentIssue } from './errors.js'
import type { FieldChoices, FieldIcons, ShowWhen } from './field-rules.js'
import { enumFields, schemaProps } from './section-fields.js'
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
 * - `choices` lists every string enum in `props` (derived from the schema); the sidebar offers them as choices.
 * - `icons` draws those choices as icons in the sidebar's picker.
 * - `form` names the handler in `src/forms` that receives what the section's form sends. The sidebar says whether it exists.
 * - `showWhen` hides props in the sidebar while the section's options make them unused.
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
  readonly choices: FieldChoices
  readonly icons: FieldIcons
  readonly showWhen: ShowWhen
  readonly form?: string
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
  /**
   * Icons for a fixed-choice field, shown in the sidebar's picker instead of the choice names alone. Keyed by field
   * (`steps[].icon`, list items as `[]`), then by choice: SVG path data on a 24 × 24 grid, drawn as a 1.8 stroke.
   * Every choice of the field needs one.
   */
  icons?: FieldIcons
  /**
   * Props the sidebar shows only while options have these values, such as `{ poster: { kind: 'video' } }`. A list
   * means any of its values; `variant`, `tone` and `motion` count as options. A hidden prop keeps its value in the file.
   */
  showWhen?: ShowWhen
  /** The form handler this section posts to: the file `src/forms/<form>.ts`, answering at `/api/<form>`. */
  form?: string
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
  const options = [variantOption(config.variants, config.defaultVariant), toneOption, motionOption, ...(config.options ?? [])]
  const choices = enumFields(config.schema)
  const icons = config.icons ?? {}
  const showWhen = config.showWhen ?? {}
  const ruleIssues = [...iconIssues(icons, choices), ...showWhenIssues(showWhen, options, schemaProps(config.schema))]
  if (ruleIssues.length > 0) {
    throw new Error(`Invalid field rules for section "${config.type}":\n${ruleIssues.map((issue) => `  - ${issue}`).join('\n')}`)
  }

  return Object.freeze({
    type: config.type,
    label: config.label,
    description: config.description,
    schema: config.schema,
    defaults: parsed.data,
    variants: config.variants,
    defaultVariant: config.defaultVariant,
    options: Object.freeze(options),
    optional: config.optional,
    counts: config.counts ?? {},
    wireframe: config.wireframe,
    choices,
    icons,
    showWhen,
    form: config.form,
    refine: config.refine,
  })
}

function iconIssues(icons: FieldIcons, choices: FieldChoices): string[] {
  const issues: string[] = []
  for (const [key, byChoice] of Object.entries(icons)) {
    const values = choices[key]
    if (!values) {
      issues.push(`icons.${key}: no field "${key}" with fixed choices in the schema`)
      continue
    }
    for (const value of values) {
      if (typeof byChoice[value] !== 'string' || byChoice[value] === '') issues.push(`icons.${key}: no icon for "${value}"`)
    }
    for (const value of Object.keys(byChoice)) {
      if (!values.includes(value)) issues.push(`icons.${key}: "${value}" is not one of its choices`)
    }
  }
  return issues
}

function showWhenIssues(showWhen: ShowWhen, options: readonly Option[], props: readonly string[]): string[] {
  const issues: string[] = []
  const optionNames = new Set(options.map((option) => option.name))
  for (const [prop, rule] of Object.entries(showWhen)) {
    if (!props.includes(prop)) issues.push(`showWhen.${prop}: no prop "${prop}" in the schema`)
    if (optionNames.has(prop)) issues.push(`showWhen.${prop}: "${prop}" is an option; showWhen applies to content props`)
    for (const [name, condition] of Object.entries(rule)) {
      const option = options.find((item) => item.name === name)
      if (!option) {
        issues.push(`showWhen.${prop}.${name}: no option "${name}"`)
        continue
      }
      if (option.type === 'boolean') {
        if (typeof condition !== 'boolean') issues.push(`showWhen.${prop}.${name}: "${name}" is on or off, so use true or false`)
        continue
      }
      if (option.type !== 'enum') {
        issues.push(`showWhen.${prop}.${name}: only choice and on/off options can show or hide a prop`)
        continue
      }
      const wanted = typeof condition === 'string' ? [condition] : Array.isArray(condition) ? condition : null
      if (wanted === null || wanted.length === 0) {
        issues.push(`showWhen.${prop}.${name}: use one of ${option.choices.join(', ')}, or a list of them`)
        continue
      }
      for (const value of wanted) {
        if (!option.choices.includes(value)) issues.push(`showWhen.${prop}.${name}: "${value}" is not one of ${option.choices.join(', ')}`)
      }
    }
  }
  return issues
}
