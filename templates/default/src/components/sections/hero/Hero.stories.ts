import { sectionArgTypes } from '../../../stories/options'
import { sectionEntry } from '../../../stories/sample'
import Hero from './Hero.astro'

const entry = sectionEntry('hero')

export default {
  title: 'Sections/Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('hero'),
}

export const Home = {
  args: {
    section: entry.section,
    index: entry.index,
  },
}

/** Variant, tone, and motion controls from the design-system catalog. */
export const Controls = {
  args: {
    section: { ...entry.section, variant: 'split', tone: 'base', motion: true },
    index: entry.index,
    motion: true,
  },
}
