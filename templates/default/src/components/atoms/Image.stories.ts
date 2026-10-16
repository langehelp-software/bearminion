import { imageArgTypes } from '../../stories/args'
import Image from './Image.astro'

export default {
  title: 'Atoms/Image',
  component: Image,
  argTypes: imageArgTypes,
}

export const Playground = {
  args: {
    src: 'src/assets/uploads/hero.png',
    alt: 'Illustrated browser window with a bear mark on a green panel',
    aspect: '4/3',
    fit: 'cover',
    rounded: '3xl',
    loading: 'lazy',
    priority: false,
    sizes: '(min-width: 1024px) 40vw, 100vw',
    widths: [480, 800, 1200],
    class: 'w-full max-w-xl',
    'data-field': 'sections.0.props.image.src',
  },
}

export const Remote = {
  args: {
    src: 'https://placehold.co/800x600/png',
    alt: 'Remote placeholder',
    aspect: '4/3',
    fit: 'cover',
    rounded: 'xl',
    class: 'w-full max-w-xl',
  },
}
