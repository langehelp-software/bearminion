import { site } from '../../stories/sample'
import MobileMenu from './MobileMenu.astro'

export default {
  title: 'Organisms/MobileMenu',
  component: MobileMenu,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story:
          'The drawer toggle ships with the built site. Storybook’s container render does not run Astro script tags, so the story shows the closed menu button.',
      },
    },
  },
}

export const Bar = {
  args: {
    site,
    floating: false,
  },
}

export const Floating = {
  args: {
    site,
    floating: true,
  },
}
