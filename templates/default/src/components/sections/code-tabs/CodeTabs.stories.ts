import { sectionArgTypes } from '../../../stories/options'
import CodeTabs from './CodeTabs.astro'
import { codeTabs } from './definition'

export default {
  title: 'Sections/Code tabs',
  component: CodeTabs,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('codeTabs'),
}

export const Defaults = {
  args: {
    section: { id: 'code-tabs', type: 'codeTabs', variant: codeTabs.defaultVariant, tone: 'inverse', props: codeTabs.defaults },
    index: 0,
    motion: false,
  },
}
