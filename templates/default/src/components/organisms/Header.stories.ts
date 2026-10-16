import { siteArgTypes } from '../../stories/options'
import { site } from '../../stories/sample'
import Header from './Header.astro'

export default {
  title: 'Organisms/Header',
  component: Header,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    pathname: { control: 'select', options: ['/', '/about', '/about/'] },
    ...siteArgTypes('header'),
  },
}

export const Home = {
  args: {
    site,
    pathname: '/',
  },
}

export const About = {
  args: {
    site,
    pathname: '/about',
  },
}
