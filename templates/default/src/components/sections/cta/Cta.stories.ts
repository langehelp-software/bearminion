import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Cta from './Cta.astro'

const entry = sectionEntry('cta')

export default {
  title: 'Sections/Cta',
  component: Cta,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('cta'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
  },
}
