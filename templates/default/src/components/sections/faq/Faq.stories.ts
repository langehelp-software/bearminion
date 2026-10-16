import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Faq from './Faq.astro'

const entry = sectionEntry('faq')

export default {
  title: 'Sections/Faq',
  component: Faq,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('faq'),
}

export const Home = {
  args: { section: entry.section, index: entry.index, motion: false },
}
