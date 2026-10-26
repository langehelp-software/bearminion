import { sectionArgTypes } from '../../../stories/options'
import { gallery } from './definition'
import Gallery from './Gallery.astro'

/** The sample pages hold no Gallery section, so the stories start from its defaults. */
const section = { id: 'gallery', type: 'gallery', variant: 'grid', tone: 'base', props: gallery.defaults } as const
const captioned = {
  ...gallery.defaults,
  images: gallery.defaults.images.map((image, index) => ({ ...image, caption: `Caption for picture ${index + 1}` })),
}

export default {
  title: 'Sections/Gallery',
  component: Gallery,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('gallery'),
}

export const Grid = { args: { section, index: 0 } }
export const Masonry = { args: { section: { ...section, variant: 'masonry', props: { ...gallery.defaults, columns: '4' } }, index: 0 } }
export const Featured = { args: { section: { ...section, variant: 'featured', tone: 'subtle', props: captioned }, index: 0 } }
export const TwoColumns = { args: { section: { ...section, props: { ...gallery.defaults, columns: '2' } }, index: 0 } }
export const Framed = { args: { section: { ...section, props: { ...gallery.defaults, frame: true } }, index: 0 } }
export const NoLightbox = { args: { section: { ...section, props: { ...gallery.defaults, lightbox: false } }, index: 0 } }
