import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import TextImage from './TextImage.astro'

const entry = sectionEntry('textImage')

export default {
  title: 'Sections/TextImage',
  component: TextImage,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('textImage'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
  },
}
