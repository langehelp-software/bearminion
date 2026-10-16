import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import LogoStrip from './LogoStrip.astro'

const entry = sectionEntry('logoStrip')

export default {
  title: 'Sections/LogoStrip',
  component: LogoStrip,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('logoStrip'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
    motion: false,
  },
}
