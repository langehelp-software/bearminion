import { sectionArgTypes } from '../../../stories/options'
import { media } from './definition'
import Media from './Media.astro'

/** The sample pages hold no Media section, so the stories start from its defaults. */
const section = { id: 'media', type: 'media', variant: 'centered', tone: 'subtle', props: media.defaults } as const
// A file path rather than a YouTube link, so Storybook loads nothing from a third party.
const linked = { ...media.defaults, video: '/videos/demo.webm' }

export default {
  title: 'Sections/Media',
  component: Media,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('media'),
}

export const Empty = { args: { section, index: 0 } }
export const Centered = { args: { section: { ...section, props: linked }, index: 0 } }
export const NoIntro = { args: { section: { ...section, tone: 'base', props: { ...linked, intro: false } }, index: 0 } }
export const Wide = { args: { section: { ...section, variant: 'wide', props: linked }, index: 0 } }
export const Split = { args: { section: { ...section, variant: 'split', props: { ...linked, aspect: '4:3' } }, index: 0 } }
export const Image = {
  args: {
    section: {
      ...section,
      variant: 'split',
      props: { ...media.defaults, kind: 'image', image: { src: 'placeholder', alt: 'Screenshot' } },
    },
    index: 0,
  },
}
