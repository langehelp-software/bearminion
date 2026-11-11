/*
 * What an uploaded video is, from its bytes, and how large a request may be. Pure: no Node imports, so the editor API
 * can run where there is no file system. The file-system half lives in `videos.ts`.
 */

export type VideoKind = 'mp4' | 'mov' | 'webm' | 'ogv'

const MIME_TO_KIND: Record<string, VideoKind> = {
  'video/mp4': 'mp4',
  'video/x-m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
}

/** Default cap for one uploaded video. */
export const DEFAULT_VIDEO_BYTE_LIMIT = 50 * 1_048_576
export { VIDEO_WARN_BYTES } from './videos-shared.js'
/** Room for multipart boundaries around a max-size video. */
export function videoBodyLimit(maxVideoBytes: number): number {
  return maxVideoBytes + 256 * 1024
}

/** The container a file really is, from its first bytes. The file's name and declared type are not trusted. */
export function sniffVideo(bytes: Uint8Array): VideoKind | null {
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)
    // AVIF images share the container.
    if (brand === 'avif' || brand === 'avis') return null
    return brand === 'qt  ' ? 'mov' : 'mp4'
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    // Matroska and WebM share the EBML header; only the `webm` doctype plays in a browser.
    return ascii(bytes, 0, Math.min(bytes.length, 64)).includes('webm') ? 'webm' : null
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS') return 'ogv'
  return null
}

export function videoKindFromMime(mime: string): VideoKind | null {
  const base = mime.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return MIME_TO_KIND[base] ?? null
}

export interface SavedVideo {
  filename: string
  /** Project-relative path of the file. */
  path: string
  /** What a Media section's `video` field holds: the file's address on the site, such as `/videos/demo-1a2b.mp4`. */
  url: string
  bytes: number
}

export type ListedVideo = Omit<SavedVideo, 'bytes'> & { bytes?: number }

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let text = ''
  for (const byte of bytes.subarray(from, to)) text += String.fromCharCode(byte)
  return text
}
