import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Pricing from './Pricing.astro'

const entry = sectionEntry('pricing')

export default {
  title: 'Sections/Pricing',
  component: Pricing,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('pricing'),
}

export const Home = {
  args: { section: entry.section, index: entry.index, motion: false },
}
