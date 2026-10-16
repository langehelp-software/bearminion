import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Contact from './Contact.astro'

const entry = sectionEntry('contact')

export default {
  title: 'Sections/Contact',
  component: Contact,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('contact'),
}

export const Home = {
  args: { section: entry.section, index: entry.index, motion: false },
}
