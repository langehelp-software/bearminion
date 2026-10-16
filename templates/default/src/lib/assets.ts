import type { ImageMetadata } from 'astro'

const localAssets = import.meta.glob<ImageMetadata>('/src/assets/**/*.{png,jpg,jpeg,webp,gif,avif}', { eager: true, import: 'default' })

export function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src)
}

/** Match a content path such as `src/assets/hero.png` to an imported asset. */
export function resolveLocalAsset(src: string): ImageMetadata | undefined {
  const normalized = src.startsWith('/') ? src : `/${src}`
  return localAssets[normalized]
}
