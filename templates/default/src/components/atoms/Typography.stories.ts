import { typographyArgTypes } from '../../stories/args'
import Typography from './Typography.astro'

export default {
  title: 'Atoms/Typography',
  component: Typography,
  argTypes: typographyArgTypes,
}

export const Playground = {
  args: {
    as: 'h1',
    size: 'display',
    color: 'default',
    weight: 'regular',
    font: 'sans',
    align: 'left',
    slots: { default: 'Content lives in git.' },
  },
}
