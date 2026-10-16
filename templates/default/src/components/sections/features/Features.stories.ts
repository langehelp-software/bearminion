import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Features from './Features.astro'

const entry = sectionEntry('features')

export default {
  title: 'Sections/Features',
  component: Features,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('features'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
  },
}
