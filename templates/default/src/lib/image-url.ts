import { getImage } from 'astro:assets'
import type { Image } from 'bearminion'
import { isRemote, resolveLocalAsset } from './assets'

/**
 * An image as a plain URL, for attributes that take no `<img>`, such as a video's `poster`. A file in `src/assets` is
 * optimized to WebP; a file uploaded in this dev session is served by the editor's dev route; a remote URL is used as
 * it is. A missing file in `src/assets` fails the build, like a missing `<Image>`.
 */
/** Widths for a responsive `srcset`; none wider than the file itself. */
const SRCSET_WIDTHS = [480, 768, 1080, 1440, 1920]

/**
 * An image as a WebP `srcset`, for a plain `<img>` that is not an Astro `<Image>`, such as a video's cover. Undefined
 * when the image is not a file in `src/assets` (a remote URL or a dev upload): then `imageUrl` alone is used.
 */
export async function imageSrcset(image: Image | undefined): Promise<string | undefined> {
  if (!image || image.hidden || !image.src || image.src === 'placeholder' || isRemote(image.src)) return undefined
  const asset = resolveLocalAsset(image.src.replace(/^\//, ''))
  if (!asset) return undefined
  const widths = SRCSET_WIDTHS.filter((width) => width < asset.width)
  widths.push(Math.min(asset.width, SRCSET_WIDTHS.at(-1) ?? asset.width))
  const sources = await Promise.all(widths.map(async (width) => `${(await getImage({ src: asset, width, format: 'webp' })).src} ${width}w`))
  return sources.join(', ')
}

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
