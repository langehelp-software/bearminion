import { sectionArgTypes } from '../../../stories/options'
import Compare from './Compare.astro'
import { compare } from './definition'

export default {
  title: 'Sections/Compare',
  component: Compare,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('compare'),
}

export const Defaults = {
  args: {
    section: { id: 'compare', type: 'compare', variant: compare.defaultVariant, tone: 'base', props: compare.defaults },
    index: 0,
    motion: false,
  },
}
