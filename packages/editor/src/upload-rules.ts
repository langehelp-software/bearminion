/**
 * Image upload rules shared by the dev server and the editor in the browser. No Node imports: the browser bundle
 * uses it too.
 */

/** The default largest image the editor accepts: 5 MB. */
export const DEFAULT_IMAGE_BYTE_LIMIT = 5 * 1_048_576
export const DEFAULT_CONVERT_QUALITY = 0.82
export const MIN_CONVERT_WIDTH = 16
export const MAX_CONVERT_WIDTH = 16_384

/** Re-encode uploads in the browser before they are sent. */
export interface ImageConvertOptions {
  to: 'webp'
  /** Wider images are scaled down to this width, never up. Default: no width cap. */
  maxWidth?: number
  /** WebP quality, 0.1 to 1. Default 0.82. */
  quality?: number
}

/** What the browser needs to know before it sends a file. */
export interface UploadRules {
  maxBytes: number
  convert: { to: 'webp'; maxWidth: number | null; quality: number } | null
}

/** Check `imageConvert` and fill in its defaults. `false` and `undefined` mean no conversion. */
export function resolveConvert(input: false | ImageConvertOptions | undefined): UploadRules['convert'] {
  if (input === undefined || input === false) return null
  if (input.to !== 'webp') throw new Error(`bearminion(): imageConvert.to must be "webp", got "${String(input.to)}".`)
  const { maxWidth, quality = DEFAULT_CONVERT_QUALITY } = input
  if (maxWidth !== undefined && (!Number.isInteger(maxWidth) || maxWidth < MIN_CONVERT_WIDTH || maxWidth > MAX_CONVERT_WIDTH)) {
    throw new Error(`bearminion(): imageConvert.maxWidth must be a whole number from ${MIN_CONVERT_WIDTH} to ${MAX_CONVERT_WIDTH}.`)
  }
  if (!Number.isFinite(quality) || quality < 0.1 || quality > 1) {
    throw new Error('bearminion(): imageConvert.quality must be a number from 0.1 to 1.')
  }
  return { to: 'webp', maxWidth: maxWidth ?? null, quality }
}

/** Check `maxImageBytes`. */
export function resolveMaxImageBytes(input: number | undefined): number {
  if (input === undefined) return DEFAULT_IMAGE_BYTE_LIMIT
  if (!Number.isInteger(input) || input < 1024) {
    throw new Error('bearminion(): maxImageBytes must be a whole number of bytes, at least 1024.')
  }
  return input
}

/** "4.2 MB", "310 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1).replace(/\.0$/, '')} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
