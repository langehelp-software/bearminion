import { buttonArgTypes } from '../../stories/args'
import Button from './Button.astro'

export default {
  title: 'Atoms/Button',
  component: Button,
  argTypes: buttonArgTypes,
}

export const Playground = {
  args: {
    variant: 'primary',
    size: 'md',
    href: '/about',
    arrow: true,
    slots: { default: 'Get started' },
  },
}

export const Primary = {
  args: { variant: 'primary', size: 'md', href: '/about', arrow: true, slots: { default: 'Primary' } },
}

export const Secondary = {
  args: { variant: 'secondary', size: 'md', href: '/about', slots: { default: 'Secondary' } },
}

export const Strong = {
  args: { variant: 'strong', size: 'md', href: '/about', slots: { default: 'Strong' } },
}

export const Ghost = {
  args: { variant: 'ghost', size: 'sm', href: '#', slots: { default: 'Ghost' } },
}

export const Text = {
  args: { variant: 'text', size: 'md', href: '/about', arrow: true, slots: { default: 'Text link' } },
}

export const ButtonElement = {
  args: { variant: 'primary', size: 'md', type: 'button', slots: { default: 'Button' } },
}
