import { site } from '../../stories/sample'
import Navigation from './Navigation.astro'

export default {
  title: 'Organisms/Navigation',
  component: Navigation,
  argTypes: {
    pathname: { control: 'select', options: ['/', '/about', '/about/'] },
    site: { control: 'object' },
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
