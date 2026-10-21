import { getImage } from 'astro:assets'
import type { Image } from 'bearminion'
import { isRemote, resolveLocalAsset } from './assets'

/**
 * An image as a plain URL, for attributes that take no `<img>`, such as a video's `poster`. A file in `src/assets` is
 * optimized to WebP; a file uploaded in this dev session is served by the editor's dev route; a remote URL is used as
 * it is. A missing file in `src/assets` fails the build, like a missing `<Image>`.
 */
export async function imageUrl(image: Image | undefined, maxWidth = 1920): Promise<string | undefined> {
  if (!image || image.hidden || !image.src || image.src === 'placeholder') return undefined
  if (isRemote(image.src)) return image.src
  const path = image.src.replace(/^\//, '')
  const asset = resolveLocalAsset(path)
  if (asset) return (await getImage({ src: asset, width: Math.min(asset.width, maxWidth), format: 'webp' })).src
  if (path.startsWith('src/assets/')) {
    if (import.meta.env.DEV) return `/__bearminion/assets?src=${encodeURIComponent(path)}`
    throw new Error(`No file in src/assets for the image "${image.src}". Restore the file, or choose another image in the editor and save.`)
  }
  return image.src
}
