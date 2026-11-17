import { sectionArgTypes } from '../../../stories/options'
import Changelog from './Changelog.astro'
import { changelog } from './definition'

export default {
  title: 'Sections/Changelog',
  component: Changelog,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('changelog'),
}

export const Defaults = {
  args: {
    section: { id: 'changelog', type: 'changelog', variant: changelog.defaultVariant, tone: 'subtle', props: changelog.defaults },
    index: 0,
    motion: false,
  },
}
