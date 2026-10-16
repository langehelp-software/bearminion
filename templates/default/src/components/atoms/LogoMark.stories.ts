import { logoArgTypes } from '../../stories/options'
import LogoMark from './LogoMark.astro'

export default {
  title: 'Atoms/LogoMark',
  component: LogoMark,
  argTypes: logoArgTypes,
}

export const Wordmark = {
  args: {
    name: 'BearMinion',
    marks: [{ start: 4, end: 10, italic: true, font: 'serif' }],
    href: '/',
  },
}

export const Stacked = {
  args: {
    name: 'BearMinion',
    href: '/',
    size: 'lg',
    stacked: true,
  },
}
