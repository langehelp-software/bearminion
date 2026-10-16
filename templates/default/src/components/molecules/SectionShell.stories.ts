import SectionShell from './SectionShell.astro'
import Typography from '../atoms/Typography.astro'

export default {
  title: 'Molecules/SectionShell',
  component: SectionShell,
  parameters: { layout: 'fullscreen' },
}

export const Base = {
  args: {
    id: 'sample',
    type: 'hero',
    variant: 'split',
    tone: 'base',
    motion: false,
    slots: {
      default: {
        component: Typography,
        props: { as: 'p', size: 'lead', class: 'section-container' },
        slots: { default: 'A section root sets the tone variables.' },
      },
    },
  },
}
