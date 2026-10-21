import { sectionArgTypes } from '../../../stories/options'
import { video } from './definition'
import Video from './Video.astro'

/** The sample pages hold no video, so the stories use the section's defaults: an empty frame until a file is linked. */
const section = { id: 'video', type: 'video', variant: 'framed', tone: 'base', props: video.defaults } as const

export default {
  title: 'Sections/Video',
  component: Video,
  parameters: { layout: 'fullscreen' },
  argTypes: sectionArgTypes('video'),
}

export const Framed = { args: { section, index: 0 } }
export const Wide = { args: { section: { ...section, variant: 'wide' }, index: 0 } }
export const Split = { args: { section: { ...section, variant: 'split' }, index: 0 } }
