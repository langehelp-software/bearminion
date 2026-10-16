import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Stats from './Stats.astro'

const entry = sectionEntry('stats')

export default {
  title: 'Sections/Stats',
  component: Stats,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('stats'),
}

export const Home = {
  args: { section: entry.section, index: entry.index, motion: false },
}
