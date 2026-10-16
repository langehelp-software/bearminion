import { atomChoices } from './options'

const select = (options: readonly string[]) => ({ control: 'select' as const, options: [...options] })

export const typographyArgTypes = {
  as: select(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'blockquote', 'div', 'li', 'figcaption']),
  size: select([...atomChoices('typography', 'size'), 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl']),
  color: select(atomChoices('typography', 'color')),
  weight: select(['regular', 'medium', 'semibold', 'bold']),
  font: select(['sans', 'serif', 'mono']),
  align: select(['left', 'center', 'right']),
}

export const buttonArgTypes = {
  variant: select(atomChoices('button', 'variant')),
  size: select(atomChoices('button', 'size')),
  href: { control: 'text' },
  type: select(['button', 'submit', 'reset']),
  arrow: { control: 'boolean' },
}

export const imageArgTypes = {
  src: { control: 'text' },
  alt: { control: 'text' },
  aspect: select(['auto', 'square', 'video', '4/3', '4/5', '3/2']),
  fit: select(['cover', 'contain']),
  rounded: select(['none', 'md', 'lg', 'xl', '2xl', '3xl', 'full']),
  loading: select(['lazy', 'eager']),
  priority: { control: 'boolean' },
  sizes: { control: 'text' },
  widths: { control: 'object' },
  class: { control: 'text' },
  'data-field': { control: 'text' },
}
