import { sectionArgTypes } from '../../../stories/options'
import { text } from './definition'
import Text from './Text.astro'

/** The sample pages hold no Text section, so the stories start from its defaults. */
const section = { id: 'text', type: 'text', variant: 'left', tone: 'base', props: text.defaults } as const

export default {
  title: 'Sections/Text',
  component: Text,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('text'),
}

export const Left = { args: { section, index: 0 } }
export const Center = { args: { section: { ...section, variant: 'center' }, index: 0 } }
export const FullWidth = { args: { section: { ...section, props: { ...text.defaults, narrow: false } }, index: 0 } }
