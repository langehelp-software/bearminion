import { DEFAULT_IMAGE_BYTE_LIMIT, formatBytes, type UploadRules } from '../upload-rules.js'

/** An image decoded, scaled and re-encoded as WebP. */
export interface ConvertedImage {
  blob: Blob
  /** True when the image was wider than the width cap and was scaled down. */
  resized: boolean
}

/** The browser work, behind an interface so the rules can be tested without a browser. */
export interface ImageCodec {
  /** Decode `file`, scale it down to `maxWidth` if it is wider, encode it as WebP. `null` when the browser cannot. */
  toWebp(file: File, options: { maxWidth: number | null; quality: number }): Promise<ConvertedImage | null>
}

export type PreparedImage = { ok: true; file: File } | { ok: false; error: string }

/** Still images the browser can decode and re-encode. GIFs may be animated, so they are never converted. */
const CONVERTIBLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

let current: UploadRules = { maxBytes: DEFAULT_IMAGE_BYTE_LIMIT, convert: null }

/** The rules the dev server reported. Until they arrive the defaults apply, and the server checks again anyway. */
export function setUploadRules(rules: UploadRules): void {
  current = rules
}

export function getUploadRules(): UploadRules {
  return current
}

function tooLarge(file: File, rules: UploadRules, converted: boolean): PreparedImage {
  const hint = converted ? '' : ' Use a smaller image.'
  return { ok: false, error: `${file.name} is ${formatBytes(file.size)}. Images must be ${formatBytes(rules.maxBytes)} or smaller.${hint}` }
}

function webpName(original: string): string {
  const stem = original.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.webp`
}

/**
 * Apply the site's upload rules to a file before it is sent: scale and re-encode it when conversion is on, keep the
 * original when conversion would not help, and refuse a file that is still over the size limit. The server enforces
 * the limit again; this check only saves the round trip and gives a clear message.
 */
export async function prepareImage(file: File, rules: UploadRules, codec: ImageCodec = browserCodec): Promise<PreparedImage> {
  const keep = (): PreparedImage => (file.size > rules.maxBytes ? tooLarge(file, rules, false) : { ok: true, file })
  if (rules.convert === null || !CONVERTIBLE.has(file.type)) return keep()

  let converted: ConvertedImage | null
  try {
    converted = await codec.toWebp(file, { maxWidth: rules.convert.maxWidth, quality: rules.convert.quality })
  } catch {
    converted = null
  }
  // A browser that cannot encode WebP hands back another type, or nothing. Upload the original.
  if (converted === null || converted.blob.type !== 'image/webp') return keep()
  // Nothing was gained: same width and not smaller. The original stays byte for byte.
  if (!converted.resized && converted.blob.size >= file.size) return keep()

  const result = new File([converted.blob], webpName(file.name), { type: 'image/webp', lastModified: file.lastModified })
  return result.size > rules.maxBytes ? tooLarge(result, rules, true) : { ok: true, file: result }
}

async function encodeWebp(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (context === null) return null
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

/** The real codec. `from-image` applies the photo's EXIF rotation; re-encoding drops the metadata, GPS included. */
export const browserCodec: ImageCodec = {
  async toWebp(file, { maxWidth, quality }) {
    if (typeof createImageBitmap !== 'function') return null
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      return null
    }
    try {
      const capped = maxWidth !== null && bitmap.width > maxWidth ? maxWidth : null
      const width = capped ?? bitmap.width
      const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
      const blob = await encodeWebp(bitmap, width, height, quality)
      return blob === null ? null : { blob, resized: capped !== null }
    } finally {
      bitmap.close()
    }
  },
}
