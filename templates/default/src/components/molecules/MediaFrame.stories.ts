import MediaFrame from './MediaFrame.astro'

export default {
  title: 'Molecules/MediaFrame',
  component: MediaFrame,
}

export const Placeholder = {
  args: {
    src: 'placeholder',
    alt: 'hero visual — editor beside live page preview',
    aspectClass: 'aspect-[4/3.4] w-full max-w-xl',
  },
}
