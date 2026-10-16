/**
 * Design-system option catalog.
 *
 * Section options (variant choices, defaults, extra controls) live with each section, in its
 * `definition.ts`; the site's header and footer options come from `defineSite`. This file holds
 * the shared builders and the vocabulary every theme implements: the four tones, the two color
 * modes and the button link looks. Atom vocabularies (button roles, type scale) belong to the theme.
 */

export const tones = ['base', 'subtle', 'inverse', 'brand'] as const
export const themeModes = ['light', 'dark'] as const

/** Link looks the editor offers on a section button. Unset keeps the section's own design. A theme styles each one. */
export const buttonStyles = ['primary', 'secondary', 'tertiary'] as const

export interface EnumOption {
  name: string
  label: string
  type: 'enum'
  choices: readonly string[]
  default: string
}

export interface BooleanOption {
  name: string
  label: string
  type: 'boolean'
  default: boolean
}

export interface NumberOption {
  name: string
  label: string
  type: 'number'
  default: number
  min: number
  max: number
}

export interface StringOption {
  name: string
  label: string
  type: 'string'
  /** Empty string means the field is omitted. */
  default: string
}

export type Option = EnumOption | BooleanOption | NumberOption | StringOption

export interface CountRule {
  /** Recommended length from the design system. Enforced only when `min` or `exact` is set. */
  recommended: number | string
  min?: number
  max?: number
  /** Exact length required for one variant. */
  exact?: { variant: string; count: number }
}

/** The tone control every section has. */
export const toneOption: EnumOption = {
  name: 'tone',
  label: 'Tone',
  type: 'enum',
  choices: tones,
  default: 'base',
}

/** The motion control every section has. */
export const motionOption: BooleanOption = {
  name: 'motion',
  label: 'Motion',
  type: 'boolean',
  default: true,
}

/** The variant control of one section: its layouts and the one a new section starts with. */
export function variantOption(choices: readonly string[], defaultValue: string): EnumOption {
  return { name: 'variant', label: 'Variant', type: 'enum', choices, default: defaultValue }
}
