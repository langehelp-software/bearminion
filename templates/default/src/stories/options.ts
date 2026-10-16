import type { Option } from 'bearminion'
import { atomOptions } from '../components/atoms/options'
import { siteDefinition } from '../components/organisms/site-definition'
import { sectionOptions, type SectionType } from '../components/sections/definitions'

type ArgType = {
  control: 'select' | 'boolean' | 'text' | { type: 'number'; min?: number; max?: number; step?: number }
  options?: readonly string[]
}

function controlFor(option: Option): ArgType {
  if (option.type === 'enum') return { control: 'select', options: option.choices }
  if (option.type === 'boolean') return { control: 'boolean' }
  if (option.type === 'number') {
    return { control: { type: 'number', min: option.min, max: option.max, step: 0.05 } }
  }
  return { control: 'text' }
}

/** Storybook controls for a section's design-system options. */
export function sectionArgTypes(type: SectionType): Record<string, ArgType | { control: false }> {
  const argTypes: Record<string, ArgType | { control: false }> = {
    section: { control: false },
    index: { control: false },
  }
  for (const option of sectionOptions[type]) {
    const key =
      option.name === 'variant' || option.name === 'tone' || option.name === 'motion'
        ? `section.${option.name}`
        : `section.props.${option.name}`
    argTypes[key] = controlFor(option)
  }
  return argTypes
}

const headerOptionNames = ['header.variant', 'header.tone', 'header.sticky', 'theme.mode', 'theme.motion']
const footerOptionNames = ['footer.variant', 'footer.tone', 'footer.badge', 'theme.mode']

/** Storybook controls for site chrome. Dot paths update the nested `site` arg. */
export function siteArgTypes(scope: 'header' | 'footer'): Record<string, ArgType | { control: false }> {
  const names = scope === 'header' ? headerOptionNames : footerOptionNames
  const argTypes: Record<string, ArgType | { control: false }> = {
    site: { control: false },
  }
  for (const name of names) {
    const option = siteDefinition.options.find((item) => item.name === name)
    if (!option) continue
    argTypes[`site.${name}`] = controlFor(option)
  }
  return argTypes
}

export const logoArgTypes = {
  name: { control: 'text' as const },
  em: { control: 'text' as const },
  size: { control: 'select' as const, options: ['sm', 'md', 'lg'] },
  stacked: { control: 'boolean' as const },
}

export function atomChoices(group: keyof typeof atomOptions, name: string): readonly string[] {
  const option = atomOptions[group].find((item) => item.name === name)
  return option?.type === 'enum' ? option.choices : []
}
