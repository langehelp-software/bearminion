import { sectionArgTypes } from '../../../stories/options'
import { steps } from './definition'
import Steps from './Steps.astro'

/** The sample pages hold no Steps section, so the stories start from its defaults. */
const section = { id: 'steps', type: 'steps', variant: 'columns', tone: 'base', props: steps.defaults } as const
const four = {
  ...steps.defaults,
  numbered: false,
  steps: [
    { icon: 'bolt', title: 'Quick', description: 'One command sets up the site and the editor.' },
    { icon: 'cursor', title: 'Easy to use', description: 'Click the text on the page and type.' },
    { icon: 'sliders', title: 'Customizable', description: 'Sections are Astro components with a schema.' },
    { icon: 'terminal', title: 'Local', description: 'Run `npm run dev` and press `Ctrl+E`.' },
  ],
} as const

export default {
  title: 'Sections/Steps',
  component: Steps,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('steps'),
}

export const Columns = { args: { section, index: 0 } }
export const Rail = { args: { section: { ...section, variant: 'rail', tone: 'subtle', props: four }, index: 0 } }
export const List = { args: { section: { ...section, variant: 'list' }, index: 0 } }
