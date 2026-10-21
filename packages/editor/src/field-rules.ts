/**
 * Field rules a section declares beside its schema, in a form the editor overlay can read without zod.
 *
 * - Field keys name a place in `props` the same way for every item of a list: `steps[].icon`, `badge.tag`.
 * - `showWhen` keeps a prop out of the sidebar unless the section's options have the given values.
 */

/** A choice an option must have, or a list of choices any of which will do. */
export type ShowCondition = string | boolean | readonly string[]

/** Prop name → option name → the value(s) that show it. Every option listed must match. */
export type ShowWhen = Readonly<Record<string, Readonly<Record<string, ShowCondition>>>>

/** Field key → fixed choices, derived from the schema's enums. */
export type FieldChoices = Readonly<Record<string, readonly string[]>>

/** Field key → choice → SVG path data on a 24 × 24 grid, drawn as a stroke. */
export type FieldIcons = Readonly<Record<string, Readonly<Record<string, string>>>>

/**
 * Field key of a path below a section's `props`: list indexes become `[]`.
 * `steps.2.icon` → `steps[].icon`, `badge.tag` → `badge.tag`.
 */
export function fieldKey(propPath: string): string {
  return propPath
    .split('.')
    .filter((part) => part !== '')
    .reduce((key, part) => (/^\d+$/.test(part) ? `${key}[]` : key === '' ? part : `${key}.${part}`), '')
}

/** Field key of a full draft path such as `sections.3.props.steps.0.icon`, or null when it is not inside a section's props. */
export function sectionFieldKey(path: string): string | null {
  const match = /^sections\.\d+\.props\.(.+)$/.exec(path)
  return match?.[1] ? fieldKey(match[1]) : null
}

/** True when every option named in the prop's rule has one of its values. A prop without a rule is always shown. */
export function isPropShown(showWhen: ShowWhen | undefined, prop: string, readOption: (option: string) => unknown): boolean {
  const rule = showWhen?.[prop]
  if (!rule) return true
  return Object.entries(rule).every(([option, condition]) => matches(condition, readOption(option)))
}

function matches(condition: ShowCondition, value: unknown): boolean {
  if (typeof condition === 'boolean') return value === condition
  if (typeof condition === 'string') return value === condition
  return typeof value === 'string' && condition.includes(value)
}
