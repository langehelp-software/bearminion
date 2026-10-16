import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Testimonials from './Testimonials.astro'

const entry = sectionEntry('testimonials')

export default {
  title: 'Sections/Testimonials',
  component: Testimonials,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('testimonials'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
  },
}
