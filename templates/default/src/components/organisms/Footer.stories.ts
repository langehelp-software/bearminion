import { siteArgTypes } from '../../stories/options'
import { site } from '../../stories/sample'
import Footer from './Footer.astro'

export default {
  title: 'Organisms/Footer',
  component: Footer,
  parameters: { layout: 'fullscreen' },
  argTypes: siteArgTypes('footer'),
}

export const Default = {
  args: {
    site,
  },
}
