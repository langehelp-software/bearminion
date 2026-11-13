import type { RegistryGroup } from './types.js'

/**
 * What the hosted editor needs in a site's own files, that `npm update bearminion` does not bring. Some belong to a
 * section (media, logo-strip) and are written only when the site has that section.
 */
export const HOSTED_GROUP: RegistryGroup = {
  label: 'Hosted editor',
  description:
    "The starter's files that the hosted editor depends on: the editing flag, the image components, SEO, the types and the page routes.",
  files: [
    'src/components/atoms/Image.astro',
    'src/components/molecules/MediaFrame.astro',
    'src/components/sections/logo-strip/LogoStrip.astro',
    'src/components/sections/media/Media.astro',
    'src/components/sections/media/MediaPlayer.astro',
    'src/components/seo/Seo.astro',
    'src/env.d.ts',
    'src/lib/editing.ts',
    'src/lib/image-url.ts',
    'src/pages/404.astro',
    'src/pages/[...slug].astro',
  ],
}

export const GROUPS: Record<string, RegistryGroup> = { hosted: HOSTED_GROUP }
